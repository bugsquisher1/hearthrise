#!/usr/bin/env node
// tools/balance-program/redesign/signature-depth/sum.mjs — THE READINGS from run.sh's and batch2.sh's reports (systems, lane/signatures-sample,
// lane/signatures-batch-2, 2026-11-26).
//
//   node tools/balance-program/redesign/signature-depth/sum.mjs            the sample (run.sh)
//   node tools/balance-program/redesign/signature-depth/sum.mjs --batch 2  batch 2 (batch2.sh): the size bar and the spread bar a row
//
// For each Signature: its four with none against the same four wearing it, on the same seeds. The held step's paired delta (mean and its
// standard error over the seeds), and Level XP, coin and kills a hero-hour as a share of the plain four's. Batch 2 reads each row on its
// best cell and its second ground, and the verdicts 15 "Decision: how a Signature stays inside the gear slice" rules.
//
// THE METRIC (game designer, lane/designer-sig-metric, 2026-11-27; 15 "Decision: the scale a Signature is sized on"): PACE STEPS. The paired
// delta of the held pace (v1-climb's payX: Level XP a hunted hero-hour from the held start, hour 4 to the four's end, a seed's against the
// plain four's on the same seed, in %) divided by PACE_STEP_PCT, the pace one held step buys on the reference cells. A held step pays more a
// kill and a faster kill pays more kills, so a shield and a damage rule read on one scale; a defensive row reads the same number as its held
// delta (the ten anchors below fit 0.43% a held step, se 0.01). The size bar: 10 +- 3 pace steps on the best cell (+3.0% to +5.6% pace), the
// se at most 3 pace steps (1.3% pace), 12 seeds. The spread bar: the second ground at most half the best, in pace steps. The held delta is
// still printed: it says HOW a row pays (depth or speed), never whether it is in band. A report not yet played prints as owed.
// Prints markdown tables. Exit 0 printed · 2 a sample report is missing.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BATCH = process.argv.includes('--batch') ? process.argv[process.argv.indexOf('--batch') + 1] : '1';
/* THE PACE A HELD STEP BUYS (%), fit through the origin on the ten defensive readings of the sample and batch 2, where a rule moves depth
   and nothing else (Cairn Belt, Ossuary Helm at 3% and 2%, Grave Guard's Mail, the Sabre's two Blunted shapes, Bargeman's Pole at -20% and
   -15%, Ferry Pennies under half and under 45%): pace / held 0.39 to 0.48, fit 0.4335 (se 0.0087). A lever: re-fit it when the pay rule
   (danger.js PAY) or the scale's step (powerStep) moves. The ledger's 0.7% (19 "Units") is a kill's pay a step; a held step also meets a
   monster 0.35% tougher, so it buys less pace than that. */
const PACE_STEP_PCT = 0.43;
const LO = 7, HI = 13, SE_MAX = 3;
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
  /* (each row as it stands in src/data/signatures.js: a reshaped row reads from its adopted shape's report, b2v-*, the as-written one is
     among the shapes tried below) */
  ['#1 Bannerman\'s Pavise (tank) DROPPED', ['Muster Barrows', 'b2-muster-tank', 'b2-muster-pavise'], ['Hask\'s Ford (pinned)', 'b2-ford-tank', 'b2-ford-pavise']],
  ['#2 Ossuary Helm (tank, + Frost Slam) CUT', ['Muster Barrows', 'b2-muster-tank-slam', 'b2v-muster-helm20'], ['(the tank\'s others pinned or unsettled)', 'b2-none', 'b2-none']],
  ['#3 Grave Guard\'s Mail (tank, + Shelter) RESHAPED', ['Muster Barrows', 'b2-muster-tank-shelter', 'b2v-muster-mail-guard30x8'], ['(the tank\'s others pinned or unsettled)', 'b2-none', 'b2-none']],
  ['#4 Charred Sabre (sword) RESHAPED', ['Pyre Field', 'b2-pyre-sword', 'b2v-pyre-sabre-target-blunt'], ['Muster Barrows', 'b2-muster-sword', 'b2v-muster-sabre-target-blunt']],
  ['#5 Pikeman\'s Gauntlets (sword)', ['Pyre Field', 'b2-pyre-sword', 'b2-pyre-gauntlets'], ['Muster Barrows', 'b2-muster-sword', 'b2-muster-gauntlets']],
  ['#7 Floodwater Hatchets (axes)', ['Flooded Wing', 'b2-flood-axes', 'b2-flood-hatchets'], ['Muster Barrows', 'b2-muster-axes', 'b2-muster-hatchets']],
  ['#9 Lurcher\'s Collar (bow)', ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-collar'], ['Pyre Field', 'b2-pyre-mixed', 'b2-pyre-collar']],
  ['#10 Coal Runner\'s Bow (bow)', ['Ox Road', 'b2-ox-mixed', 'b2-ox-coalbow'], ['Pyre Field', 'b2-pyre-mixed', 'b2-pyre-coalbow']],
  ['#11 Provost\'s Longbow (bow)', ['Pyre Field', 'b2-pyre-mixed', 'b2-pyre-longbow'], ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-longbow']],
  ['#12 Wyvern Barb Crossbow (crossbow)', ['Wyvern Roost', 'b2-roost-crossbow', 'b2-roost-barb'], ['Pyre Field', 'b2-pyre-crossbow', 'b2-pyre-barb']],
  ['#13 Hall Fire Wand (mage)', ['Krell\'s Hold', 'b2-krell-mixed', 'b2-krell-wand'], ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-wand']],
  ['#15 Catacomb Shroud (mage)', ['Bone Wing', 'b2-bone-mixed', 'b2-bone-shroud'], ['Krell\'s Hold', 'b2-krell-mixed', 'b2-krell-shroud']],
  /* (the mage takes 0.1% of the damage on Muster and 12% on Pyre Field: its barrier breaks only where it is hit) */
  ['#16 Lamplighter\'s Robe (mage)', ['Pyre Field', 'b2-pyre-mixed', 'b2-pyre-robe'], ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-robe']],
  /* (the low-health lines reshaped to where Steady meets them: it falls back at 25%, and Bold pins the Slake's four at its top) */
  ['#17 Bargeman\'s Pole (healer) RESHAPED, CUT', ['Muster Barrows', 'b2-muster-mixed', 'b2v-muster-pole15'], ['The Slake (at -20%: the cut only lowers it)', 'b2-slake-mixed', 'b2-slake-pole50']],
  ['#21 Drover\'s Hat (healer)', ['Ox Road', 'b2-ox-mixed', 'b2-ox-hat'], ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-hat']],
  ['#23 Ferry Pennies (tank) RESHAPED', ['Muster Barrows', 'b2-muster-tank', 'b2v-muster-pennies-blunt45'], ['(the tank\'s others pinned or unsettled)', 'b2-none', 'b2-none']],
];
/* THE SHAPES TRIED on a row that missed its band (b2v-*: a variant row played as a temporary id on a scratch snapshot, taken out before
   commit, as the designer's lane read the sample's): [label, plain, worn] */
const VARIANTS = [
  ['#2 Ossuary Helm as written, 3% a monster up to 15% (Muster)', 'b2-muster-tank-slam', 'b2-muster-helm'],
  ['#2 Ossuary Helm as written (Krell\'s Hold: the tank four never falls back there)', 'b2-krell-tank-slam', 'b2-krell-helm'],
  ['#2 Ossuary Helm, 2% a monster up to 10% (Muster)', 'b2-muster-tank-slam', 'b2v-muster-helm20'],
  ['#3 Grave Guard\'s Mail as written, Challenge ready (Muster)', 'b2-muster-tank-shelter', 'b2-muster-mail'],
  ['#23 Ferry Pennies as written, under 20%: Chill 3 s (Muster)', 'b2-muster-tank', 'b2-muster-pennies'],
  ['#23 Ferry Pennies, under 40%: Chill 3 s (Muster)', 'b2-muster-tank', 'b2-muster-pennies40'],
  ['#23 Ferry Pennies, under 40%: Chill 6 s within 2 tiles (Muster)', 'b2-muster-tank', 'b2v-muster-pennies-chill6'],
  ['#23 Ferry Pennies, under 40%: Blunted on each monster next to you (Muster)', 'b2-muster-tank', 'b2v-muster-pennies-blunt'],
  ['#23 Ferry Pennies, under 40%: Blunted within 2 tiles (Muster)', 'b2-muster-tank', 'b2v-muster-pennies-blunt2'],
  ['#23 Ferry Pennies, under 40%: Chill 3 s and Blunted, next to you (Muster)', 'b2-muster-tank', 'b2v-muster-pennies-both'],
  ['#23 Ferry Pennies, under half: Blunted on each monster next to you (Muster)', 'b2-muster-tank', 'b2v-muster-pennies-blunt50'],
  ['#23 Ferry Pennies, under 45%: Blunted on each monster next to you (Muster)', 'b2-muster-tank', 'b2v-muster-pennies-blunt45'],
  ['#3 Grave Guard\'s Mail, a shell it cast breaks: Guarded -20% 4 s on that hero (Muster)', 'b2-muster-tank-shelter', 'b2v-muster-mail-guard'],
  ['#3 Grave Guard\'s Mail, a shell it cast breaks: Guarded -30% 6 s on that hero (Muster)', 'b2-muster-tank-shelter', 'b2v-muster-mail-guard30'],
  ['#3 Grave Guard\'s Mail, a shell it cast breaks: Guarded -30% 8 s on that hero (Muster)', 'b2-muster-tank-shelter', 'b2v-muster-mail-guard30x8'],
  ['#3 Grave Guard\'s Mail, a shell it cast breaks: Shelter 10 s sooner (Muster)', 'b2-muster-tank-shelter', 'b2v-muster-mail-reset'],
  ['#4 Charred Sabre as written, a Flame Strike kill: cast again at no cost (Pyre)', 'b2-pyre-sword', 'b2-pyre-sabre'],
  ['#4 Charred Sabre, any Flame Strike hit: cast again on the nearest at no cost (Pyre)', 'b2-pyre-sword', 'b2v-pyre-sabre-hit'],
  ['#4 Charred Sabre, a Flame Strike cast: Blunted on every monster next to you (Pyre)', 'b2-pyre-sword', 'b2v-pyre-sabre-blunt'],
  ['#4 Charred Sabre, a Flame Strike kill: Blunted on every monster next to you (Pyre)', 'b2-pyre-sword', 'b2v-pyre-sabre-kill-blunt'],
  ['#4 Charred Sabre, a Flame Strike cast: Blunted on its target (Pyre)', 'b2-pyre-sword', 'b2v-pyre-sabre-target-blunt'],
  ['#7 Floodwater Hatchets, Rend: Poison 60% of the cast over 6 s (Flooded Wing)', 'b2-flood-axes', 'b2v-flood-hatchets60'],
  ['#17 Bargeman\'s Pole, under half: Guarded -20% 4 s (Muster)', 'b2-muster-mixed', 'b2-muster-pole50'],
  ['#17 Bargeman\'s Pole, under half: Guarded -20% 4 s (the Slake)', 'b2-slake-mixed', 'b2-slake-pole50'],
  ['#17 Bargeman\'s Pole, under half: Guarded -15% 4 s (Muster)', 'b2-muster-mixed', 'b2v-muster-pole15'],
  ['#17 Bargeman\'s Pole, under 40%: Guarded -20% 4 s (Muster)', 'b2-muster-mixed', 'b2v-muster-pole40'],
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
/* a paired reading of the worn four over the plain one on the seeds both read (a seed whose four never held reads nothing): its mean and standard error.
   heldOf: the held step's delta. paceOf: the held pace's delta (payX, %) in PACE STEPS (PACE_STEP_PCT a step), the size bar's metric */
const stats = (d) => {
  if (!d.length) return null;
  const m = d.reduce((x, y) => x + y, 0) / d.length;
  const sd = Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, d.length - 1));
  return { m, se: sd / Math.sqrt(d.length), n: d.length };
};
const zip = (a, b, f) => { const d = []; a.forEach((x, i) => { const y = b[i]; if (Number.isFinite(x) && Number.isFinite(y) && f(x, y) !== null) d.push(f(x, y)); }); return d; };
const heldOf = (p, s) => stats(zip(p.held.perSeed, s.held.perSeed, (x, y) => y - x));
/* (payX.perSeed drops a seed with no pay window, so a list shorter than the seeds read cannot be paired by place: none is read; a seed
   whose four earned nothing from the held start, the unsettled tank four on Krell's Hold, reads nothing) */
const paceOf = (p, s) => (p.payX.perSeed.length !== p.seedsRead || s.payX.perSeed.length !== s.seedsRead ? null
  : stats(zip(p.payX.perSeed, s.payX.perSeed, (x, y) => (x > 0 && y > 0 ? ((y / x - 1) * 100) / PACE_STEP_PCT : null))));
const show = (d, n) => (d ? sgn(d.m) + ' (' + d.se.toFixed(1) + (n ? ', ' + d.n : '') + ')' : 'no hold');
/* the size bar on a reading in pace steps (15 "Decision: the scale a Signature is sized on") */
const sizeOf = (d) => (!d ? 'owed' : d.m > HI ? (d.se > SE_MAX ? 'over, se ' + d.se.toFixed(1) + ': more seeds' : 'OVER (cut its number)')
  : d.m < LO ? (d.m + d.se < LO ? 'UNDER (raise or reshape)' : d.se > SE_MAX ? 'under, se ' + d.se.toFixed(1) + ': more seeds' : 'UNDER (raise or reshape)')
  : d.se > SE_MAX ? 'in band, se ' + d.se.toFixed(1) + ': more seeds' : 'in band');

if (BATCH !== '2') {
  console.log('| Signature | Ground | Plain held | Held delta (se) | Pace steps (se) | Size bar | Level XP/h | Coin/h | Kills/h | Deaths |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const [name, ground, a, b] of PAIRS) {
    const p = cellOf(a, true), s = cellOf(b, true), h = heldOf(p, s), q = paceOf(p, s);
    console.log('| ' + [name, ground, p.held.mean.toFixed(1), show(h, true), show(q), sizeOf(q),
      pct(s.xpPerHeroH, p.xpPerHeroH), pct(s.gold.coinPerHeroH.mean, p.gold.coinPerHeroH.mean), pct(s.killsPerH, p.killsPerH), p.deaths + ' / ' + s.deaths].join(' | ') + ' |');
  }
  process.exit(0);
}

/* batch 2: one line a row, both cells, the two bars, both on pace steps */
console.log('| Signature | Best cell | Plain held | Held delta (se, seeds) | Pace steps (se) | Kills/h | Second ground | Its pace steps (se) | Size bar (10 +- 3 pace steps, se <= 3) | Spread bar (second <= half the best) |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const [name, best, other] of ROWS2) {
  const read = ([g, a, b]) => { const p = cellOf(a), s = cellOf(b); return p && s ? { g, p, s, h: heldOf(p, s), q: paceOf(p, s) } : { g, owed: true }; };
  const B = read(best), O = read(other);
  const size = B.owed ? 'owed' : sizeOf(B.q);
  /* (the spread is read only for a size that reaches the band: under it, the row is reshaped first) */
  const spread = B.owed || !B.q ? 'owed' : B.q.m < LO ? 'n/a (under its size)' : O.owed || !O.q ? 'not read' : O.q.m <= B.q.m / 2 ? 'holds'
    : O.q.m - O.q.se <= B.q.m / 2 ? 'holds within its se' : 'FAILS (big everywhere: reshape)';
  console.log('| ' + [name, B.g, B.owed ? 'owed' : B.p.held.mean.toFixed(1), B.owed ? 'owed' : show(B.h, true), B.owed ? 'owed' : show(B.q),
    B.owed ? '' : pct(B.s.killsPerH, B.p.killsPerH), O.g, O.owed ? 'owed' : show(O.q), size, spread].join(' | ') + ' |');
}
console.log('\n| Shape tried | Held delta (se, seeds) | Pace steps (se) | Size bar | Kills/h |\n|---|---|---|---|---|');
for (const [name, a, b] of VARIANTS) {
  const p = cellOf(a), s = cellOf(b), h = p && s ? heldOf(p, s) : null, q = p && s ? paceOf(p, s) : null;
  console.log('| ' + [name, h ? show(h, true) : 'owed', q ? show(q) : 'owed', q ? sizeOf(q) : '', p && s ? pct(s.killsPerH, p.killsPerH) : ''].join(' | ') + ' |');
}
for (const [name, a, b, top] of PINNED) {
  const p = cellOf(a), s = cellOf(b), h = p && s ? heldOf(p, s) : null;
  if (h) console.log('\npinned: ' + name + ': the plain four holds ' + p.held.mean.toFixed(1) + ' of the ground\'s top ' + top + ', the Signature ' + sgn(h.m) + ' (' + h.se.toFixed(1) + ') held');
}
