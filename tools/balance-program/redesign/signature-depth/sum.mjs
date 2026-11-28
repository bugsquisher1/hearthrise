#!/usr/bin/env node
// tools/balance-program/redesign/signature-depth/sum.mjs — THE READINGS from run.sh's and batch2.sh's reports (systems, lane/signatures-sample,
// lane/signatures-batch-2, 2026-11-26).
//
//   node tools/balance-program/redesign/signature-depth/sum.mjs            the sample (run.sh)
//   node tools/balance-program/redesign/signature-depth/sum.mjs --batch 2  batch 2 (batch2.sh): the size bar and the spread bar a row
//   node tools/balance-program/redesign/signature-depth/sum.mjs --batch 3  batch 3 (batch3.sh, lane/signatures-batch-3): the same bars, the
//                                                                           coin pieces' coin a hero-hour, the shapes tried
//   node tools/balance-program/redesign/signature-depth/sum.mjs --batch 4  batch 4 (batch4.sh, lane/designer-sig-batch4): batch 3's under
//                                                                           rows reshaped, fight rows on pace steps, coin rows on coin steps;
//                                                                           and batch 4's own 14 rows (lane/signatures-batch-4, b4s-*) first
//   node tools/balance-program/redesign/signature-depth/sum.mjs --batch 5  batch 5 (batch5.sh, lane/designer-sig-batch5): the out-of-band
//                                                                           rows reshaped, and the Cloak on rule F's Bold measure
//
// For each Signature: its four with none against the same four wearing it, on the same seeds. The held step's paired delta (mean and its
// standard error over the seeds), and Level XP, coin and kills a hero-hour as a share of the plain four's. Batch 2 reads each row on its
// best cell and its second ground, and the verdicts 15 "Decision: how a Signature stays inside the gear slice" rules.
//
// THE METRIC (game designer, lane/designer-sig-metric, 2026-11-27; 15 "Decision: the scale a Signature is sized on"): PACE STEPS. The paired
// delta of the held pace (v1-climb's payX: Level XP a hunted hero-hour from the held start, hour 4 to the four's end, a seed's against the
// plain four's on the same seed, in %) divided by the pace one held step buys ON THAT GROUND (pace-step.mjs PACE_STEP, lane/pace-step-per-
// ground 2026-11-28: one global 0.43 read Carter's Rest twice too big). A held step pays more a kill and a faster kill pays more kills, so a
// shield and a damage rule read on one scale; a defensive row reads the same number as its held delta. The size bar: 10 +- 3 pace steps on
// the best cell, the se at most 3 pace steps, 12 seeds. The spread bar: the second ground at most half the best, in pace steps. The held
// delta is still printed: it says HOW a row pays (depth or speed), never whether it is in band. A report not yet played prints as owed, a
// ground with no measured pace step as "no pace step".
// Prints markdown tables. Exit 0 printed · 2 a sample report is missing.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BATCH = process.argv.includes('--batch') ? process.argv[process.argv.indexOf('--batch') + 1] : '1';
/* THE PACE A HELD STEP BUYS (%), GROUND BY GROUND (pace-step.mjs): measured on each ground's reference four with a lever that moves depth
   and nothing else, 24 seeds paired. A ground's value reads every four on it (the plain report's `ground`) */
import { paceStepPct } from './pace-step.mjs';
const LO = 7, HI = 13, SE_MAX = 3;
const PAIRS = [
  ['Cairn Belt (tank)', 'Muster Barrows', 'muster-tank', 'muster-cairn-belt'],
  ['Barrow Knight\'s Blade (sword)', 'Muster Barrows', 'muster-sword', 'muster-blade'],
  ['Lurcher\'s Collar (bow)', 'Pyre Field', 'pyre-mixed', 'pyre-collar'],
  ['The Wood Book (mage)', 'Muster Barrows', 'muster-mixed', 'muster-wood-book'],
  ['Brewer\'s Apron (healer)', 'Muster Barrows', 'muster-mixed', 'muster-apron'],
  /* (lane/designer-sig-metric: the Apron at the size bar's 12 seeds, against batch 2's plain mixed four; the current tree replays it exactly) */
  ['Brewer\'s Apron (healer), 12 seeds', 'Muster Barrows', 'b2-muster-mixed', 'b2m-muster-apron'],
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
  ['#4 Charred Saber (sword) RESHAPED', ['Pyre Field', 'b2-pyre-sword', 'b2v-pyre-sabre-target-blunt'], ['Muster Barrows', 'b2-muster-sword', 'b2v-muster-sabre-target-blunt']],
  ['#5 Pikeman\'s Gauntlets (sword)', ['Pyre Field', 'b2-pyre-sword', 'b2-pyre-gauntlets'], ['Muster Barrows', 'b2-muster-sword', 'b2-muster-gauntlets']],
  ['#7 Floodwater Hatchets (axes)', ['Flooded Wing', 'b2-flood-axes', 'b2-flood-hatchets'], ['Muster Barrows', 'b2-muster-axes', 'b2-muster-hatchets']],
  ['#9 Lurcher\'s Collar (bow) CLOCK 2 s', ['Muster Barrows', 'b2-muster-mixed', 'b2m-muster-collar2s'], ['Pyre Field', 'b2-pyre-mixed', 'b2m-pyre-collar2s']],
  ['#10 Coal Runner\'s Bow (bow)', ['Ox Road', 'b2-ox-mixed', 'b2-ox-coalbow'], ['Pyre Field', 'b2-pyre-mixed', 'b2-pyre-coalbow']],
  ['#11 Provost\'s Longbow (bow)', ['Pyre Field', 'b2-pyre-mixed', 'b2-pyre-longbow'], ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-longbow']],
  ['#12 Wyvern Barb Crossbow (crossbow)', ['Wyvern Roost', 'b2-roost-crossbow', 'b2-roost-barb'], ['Pyre Field', 'b2-pyre-crossbow', 'b2-pyre-barb']],
  ['#13 Hall Fire Wand (mage)', ['Krell\'s Hold', 'b2-krell-mixed', 'b2-krell-wand'], ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-wand']],
  /* (on pace steps the Shroud's best cell is Krell's Hold, where Pyre Priests cast: its Silence stops them, kills +6.9%) */
  ['#15 Catacomb Shroud (mage)', ['Krell\'s Hold', 'b2-krell-mixed', 'b2-krell-shroud'], ['Bone Wing', 'b2-bone-mixed', 'b2-bone-shroud']],
  /* (the mage takes 0.1% of the damage on Muster and 12% on Pyre Field: its barrier breaks only where it is hit) */
  ['#16 Lamplighter\'s Robe (mage)', ['Pyre Field', 'b2-pyre-mixed', 'b2-pyre-robe'], ['Muster Barrows', 'b2-muster-mixed', 'b2-muster-robe']],
  /* (the low-health lines reshaped to where Steady meets them: it falls back at 25%, and Bold pins the Slake's four at its top) */
  ['#17 Bargeman\'s Pole (healer) RESHAPED, CUT', ['Muster Barrows', 'b2-muster-mixed', 'b2v-muster-pole15'], ['The Slake (at -20%: the cut only lowers it)', 'b2-slake-mixed', 'b2-slake-pole50']],
  ['#21 Drover\'s Hat (healer) CUT to 25%', ['Ox Road', 'b2-ox-mixed', 'b2m-ox-hat25'], ['Muster Barrows', 'b2-muster-mixed', 'b2m-muster-hat25']],
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
  ['#4 Charred Saber as written, a Flame Strike kill: cast again at no cost (Pyre)', 'b2-pyre-sword', 'b2-pyre-sabre'],
  ['#4 Charred Saber, any Flame Strike hit: cast again on the nearest at no cost (Pyre)', 'b2-pyre-sword', 'b2v-pyre-sabre-hit'],
  ['#4 Charred Saber, a Flame Strike cast: Blunted on every monster next to you (Pyre)', 'b2-pyre-sword', 'b2v-pyre-sabre-blunt'],
  ['#4 Charred Saber, a Flame Strike kill: Blunted on every monster next to you (Pyre)', 'b2-pyre-sword', 'b2v-pyre-sabre-kill-blunt'],
  ['#4 Charred Saber, a Flame Strike cast: Blunted on its target (Pyre)', 'b2-pyre-sword', 'b2v-pyre-sabre-target-blunt'],
  ['#7 Floodwater Hatchets, Rend: Poison 60% of the cast over 6 s (Flooded Wing)', 'b2-flood-axes', 'b2v-flood-hatchets60'],
  ['#17 Bargeman\'s Pole, under half: Guarded -20% 4 s (Muster)', 'b2-muster-mixed', 'b2-muster-pole50'],
  ['#17 Bargeman\'s Pole, under half: Guarded -20% 4 s (the Slake)', 'b2-slake-mixed', 'b2-slake-pole50'],
  ['#17 Bargeman\'s Pole, under half: Guarded -15% 4 s (Muster)', 'b2-muster-mixed', 'b2v-muster-pole15'],
  ['#17 Bargeman\'s Pole, under 40%: Guarded -20% 4 s (Muster)', 'b2-muster-mixed', 'b2v-muster-pole40'],
  /* (lane/designer-sig-metric: the rows as they stood before the re-read on pace steps) */
  ['#9 Lurcher\'s Collar, a Bleed stack once every 4 s (Muster)', 'b2-muster-mixed', 'b2-muster-collar'],
  ['#12 Wyvern Barb Crossbow, Poison 35% of the hit (Wyvern Roost)', 'b2-roost-crossbow', 'b2m-roost-barb35'],
  ['#21 Drover\'s Hat, 50% back (Ox Road)', 'b2-ox-mixed', 'b2-ox-hat'],
  ['#21 Drover\'s Hat, 50% back (Muster)', 'b2-muster-mixed', 'b2-muster-hat'],
];
/* THE LUCK CEILING'S TOP (19 V10's stand-in while the kit sampler is owed): the tank four with every Trait made for its seat at rank III
   (--traits lucky), then those and the biggest in-band Signature, against the plain four. Bar: at most the gear slice, 20 pace steps */
const LUCKY = [
  ['tank four, every tank Trait at rank III (Muster)', 'b2-muster-tank', 'b2m-muster-tank-lucky'],
  ['tank four, those Traits and Ferry Pennies (Muster)', 'b2-muster-tank', 'b2m-muster-tank-lucky-pennies'],
  ['Ferry Pennies on top of the lucky Traits (Muster)', 'b2m-muster-tank-lucky', 'b2m-muster-tank-lucky-pennies'],
];
/* (the home ground pinned: the tank four at Hask's Ford's top; printed under the table as the reading of why the tank reads elsewhere) */
const PINNED = [['#1 Bannerman\'s Pavise on Hask\'s Ford, its home', 'b2-ford-tank', 'b2-ford-pavise', 655]];
const cellOf = (name, need) => {
  const f = join(HERE, name + '.json');
  if (!existsSync(f)) { if (need) { console.error('sum: no report ' + f); process.exit(2); } return null; }
  const r = JSON.parse(readFileSync(f, 'utf8'));
  return { ground: r.ground, ...Object.values(r.cells)[0] };
};
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100).toFixed(1) + '%' : 'n/a');
const sgn = (x) => (x >= 0 ? '+' : '') + x.toFixed(1);
/* a paired reading of the worn four over the plain one on the seeds both read (a seed whose four never held reads nothing): its mean and standard error.
   heldOf: the held step's delta. paceOf: the held pace's delta (payX, %) in PACE STEPS (the plain cell's ground's pace step), the size
   bar's metric; { noStep } on a ground pace-step.mjs has not measured */
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
/* (lane/signatures-batch-3) a report that carries each seed's pace to 5 places (v1-climb payX.exact) is read on it, both arms or neither:
   perSeed's hundredths move a paired delta in quanta of about 2.6 pace steps */
const paysOf = (p, s) => (p.payX.exact && s.payX.exact ? [p.payX.exact, s.payX.exact] : [p.payX.perSeed, s.payX.perSeed]);
/* the plain cell's pace step (its ground, and a lone hero apart). A cell paid at the floor (null: a held step buys no pace there) reads in
   its best cell's steps when it is a second ground (`best`, that cell's plain report), so the spread bar compares pace itself; a best cell
   there, or a cell nobody measured, stops the sum */
const stepOf = (p, best) => {
  const k = paceStepPct(p.ground, p.seats.length);
  if (k === null && best) return stepOf(best);
  if (typeof k !== 'number') {
    console.error('sum: ' + p.ground + ' (' + p.seats.length + (p.seats.length === 1 ? ' hero' : ' heroes') + ') ' + (k === null ? 'is paid at the floor, so no Signature is sized there'
      : 'has no measured pace step (pace-step.mjs): measure it before a Signature is read there'));
    process.exit(2);
  }
  return k;
};
const paceOf = (p, s, best) => {
  const k = stepOf(p, best);
  return p.payX.perSeed.length !== p.seedsRead || s.payX.perSeed.length !== s.seedsRead ? null
    : stats(zip(...paysOf(p, s), (x, y) => (x > 0 && y > 0 ? ((y / x - 1) * 100) / k : null)));
};
const show = (d, n) => (d ? sgn(d.m) + ' (' + d.se.toFixed(1) + (n ? ', ' + d.n : '') + ')' : 'no hold');
/* the size bar on a reading in pace steps (15 "Decision: the scale a Signature is sized on") */
const sizeOf = (d) => (!d ? 'owed' : d.m > HI ? (d.se > SE_MAX ? 'over, se ' + d.se.toFixed(1) + ': more seeds' : 'OVER (cut its number)')
  : d.m < LO ? (d.m + d.se < LO ? 'UNDER (raise or reshape)' : d.se > SE_MAX ? 'under, se ' + d.se.toFixed(1) + ': more seeds' : 'UNDER (raise or reshape)')
  : d.se > SE_MAX ? 'in band, se ' + d.se.toFixed(1) + ': more seeds' : 'in band');

/* BATCH 3 (lane/signatures-batch-3, batch3.sh): [name, [best ground, plain, worn], [second ground, plain, worn] | null], each against its
   plain four played again on this tree (the b3 plains). COIN: the coin pieces' rule moves the supply bill, so a row prints the store bill
   a hero-hour (gold.storePerHeroH) and the kit's charge (runes) and drink lines beside its pace; means over the seeds (v1-climb keeps no
   per-seed coin), never the size bar (15 "Decision: the scale a Signature is sized on": coin is the market's) */
const ROWS3 = [
  ['#1 Bannerman\'s Pavise (tank)', ['Muster Barrows', 'b3-muster-tank', 'b3-muster-pavise'], null],
  ['#19 Lock-Keeper\'s Chain (healer)', ['Muster Barrows', 'b3-muster-mixed', 'b3-muster-chain'], ['The Slake', 'b3-slake-mixed', 'b3-slake-chain']],
  ['#20 Greened Bracers (healer)', ['Muster Barrows', 'b3-muster-mixed', 'b3-muster-bracers'], ['The Slake, its home', 'b3-slake-mixed', 'b3-slake-bracers']],
  ['#22 Slake Waders (a lone sword)', ['The Slake, its home', 'b3-slake-lone', 'b3-slake-waders'], ['Muster Barrows', 'b3-muster-lone', 'b3-muster-waders']],
  ['#24 Stoker\'s Ring (mage)', ['Muster Barrows', 'b3-muster-mixed', 'b3-muster-stoker'], ['Pyre Field, its home', 'b3-pyre-mixed', 'b3-pyre-stoker']],
  ['#26 Thrower\'s Ring (healer)', ['Muster Barrows', 'b3-muster-mixed', 'b3-muster-thrower'], ['Carter\'s Rest, its home', 'b3-carters-mixed', 'b3-carters-thrower']],
  ['#28 Vault Leech Ring (healer)', ['Muster Barrows', 'b3-muster-mixed', 'b3-muster-leech'], ['Pyre Field', 'b3-pyre-mixed', 'b3-pyre-leech']],
  ['#29 Fledgling Claw (axes)', ['Muster Barrows', 'b3-muster-axes', 'b3-muster-claw'], null],
  ['#31 The Cellar Key (healer)', ['Muster Barrows', 'b3-muster-mixed', 'b3-muster-key'], ['Carter\'s Rest, its home', 'b3-carters-mixed', 'b3-carters-key']],
  ['#38 Drowned Signet (ranger)', ['Muster Barrows', 'b3-muster-mixed', 'b3-muster-signet'], ['Hask\'s Ford', 'b3-hask-mixed', 'b3-hask-signet']],
  ['#42 Night Carter\'s Boots (tank)', ['Muster Barrows', 'b3-muster-tank', 'b3-muster-boots'], null],
  ['#43 Bull\'s Tooth (ranger)', ['Muster Barrows', 'b3-muster-mixed', 'b3-muster-tooth'], ['Wyvern Roost, its home', 'b3-roost-crossbow', 'b3-roost-tooth']],
  /* (the coin pieces at 4 seeds, against the plain four's own 4-seed reports: coin is a mean over seeds, never paired, so both arms read
     the same 4 seeds) */
  ['#25 The Cold Candle (mage, coin, 4 seeds)', ['Muster Barrows', 'b3-muster-mixed4', 'b3-muster-candle'], null],
  ['#27 Riverstone Earrings (healer, coin, 4 seeds)', ['Muster Barrows', 'b3-muster-mixed4', 'b3-muster-riverstone'], null],
  ['#33 Teamster\'s Mitts (tank, coin, 4 seeds)', ['Muster Barrows', 'b3-muster-tank4', 'b3-muster-mitts'], null],
];
/* THE SHAPES TRIED on a batch-3 row that missed (a temporary id on a scratch copy, b3v-*): [label, plain, worn] */
const VARIANTS3 = [
  ['#1 Bannerman\'s Pavise, a Challenge: the monsters it taunts Weakened (-8%, 8 s) (Muster)', 'b3-muster-tank', 'b3v-muster-pavise-weak'],
  ['#42 Night Carter\'s Boots, a pull: its pack Weakened (-8%, 8 s) (Muster)', 'b3-muster-tank', 'b3v-muster-boots-weak'],
  ['#31 The Cellar Key, every fifth death: a shield of 3% of max health on each hero of the party (Muster)', 'b3-muster-mixed', 'b3v-muster-key-shield'],
  ['#26 Thrower\'s Ring, a shell you cast breaks: its hero gets a shield of 6% of max health (Muster; the new shell breaks too, so it never stops)', 'b3-muster-mixed', 'b3v-muster-thrower-shield'],
  ['#26 Thrower\'s Ring, a shell you cast breaks: its hero gets a shield of 6% of max health, once every 30 s a hero (Muster)', 'b3-muster-mixed', 'b3v-muster-thrower-shield30'],
];
if (BATCH === '3') {
  const coin = (p, s) => { const d = (f) => Math.round(f(s) - f(p)); return 'store ' + sgn(d((c) => c.gold.storePerHeroH.mean)).replace('.0', '') + ', runes ' + sgn(d((c) => c.kit.charge)).replace('.0', '') + ', drink ' + sgn(d((c) => c.kit.drink)).replace('.0', ''); };
  console.log('| Signature | Best cell | Plain held | Held delta (se, seeds) | Pace steps (se) | Kills/h | Coin a hero-hour (worn - plain) | Second ground | Its pace steps (se) | Size bar (10 +- 3 pace steps, se <= 3) | Spread bar (second <= half the best) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [name, best, other] of ROWS3) {
    const read = (x, bp) => { if (!x) return { g: '(none read)', owed: true, none: true }; const [g, a, b] = x; const p = cellOf(a), s = cellOf(b); return p && s ? { g, p, s, h: heldOf(p, s), q: paceOf(p, s, bp) } : { g, owed: true }; };
    const B = read(best), O = read(other, B.p);
    /* (a coin piece is the market's, never the size bar's; a row under its size reads no second ground) */
    const isCoin = / coin/.test(name), under = !B.owed && !!B.q && B.q.m < LO;
    const size = B.owed ? 'owed' : isCoin ? 'a coin piece (the market\'s, no bar)' : sizeOf(B.q);
    const spread = B.owed || !B.q ? 'owed' : isCoin ? 'n/a' : under ? 'n/a (under its size)' : O.none ? 'no second cell' : O.owed || !O.q ? 'not read' : O.q.m <= B.q.m / 2 ? 'holds'
      : O.q.m - O.q.se <= B.q.m / 2 ? 'holds within its se' : 'FAILS (big everywhere: reshape)';
    const second = O.none ? '' : O.owed ? (under || isCoin ? 'not read' : 'owed') : show(O.q);
    console.log('| ' + [name, B.g, B.owed ? 'owed' : B.p.held.mean.toFixed(1), B.owed ? 'owed' : show(B.h, true), B.owed ? 'owed' : show(B.q),
      B.owed ? '' : pct(B.s.killsPerH, B.p.killsPerH), B.owed ? '' : coin(B.p, B.s), O.g, second, size, spread].join(' | ') + ' |');
  }
  if (VARIANTS3.length) console.log('\n| Shape tried | Held delta (se, seeds) | Pace steps (se) | Size bar | Kills/h |\n|---|---|---|---|---|');
  for (const [name, a, b] of VARIANTS3) {
    const p = cellOf(a), s = cellOf(b), h = p && s ? heldOf(p, s) : null, q = p && s ? paceOf(p, s) : null;
    console.log('| ' + [name, h ? show(h, true) : 'owed', q ? show(q) : p && s ? 'no pay window' : 'owed', q ? sizeOf(q) : '', p && s ? pct(s.killsPerH, p.killsPerH) : ''].join(' | ') + ' |');
  }
  process.exit(0);
}

/* BATCH 4 (game designer, lane/designer-sig-batch4, batch4.sh): batch 3's under rows reshaped, against batch 3's plain fours (the tree
   replays them exactly). A FIGHT row reads the size bar in pace steps, as batch 3. A COIN row (15 "Coin pieces: the bar") reads COIN STEPS:
   the store bill its four saves a hero-hour, x 4 (the whole saving is the wearer's own: it pays its own runes, drinks and arrows), over the
   plain four's net coin a hero-hour (coin and loot at the store's price, less the store bill), in its ground's pace steps. The coin bar is 20 +- 6
   coin steps: a coin piece pays in coin alone, so it is sized on what a fight row in band pays its wearer in pace and coin together (the Chain
   12.0 pace and 9.9 coin, the Hat 9.2 and 16.9). The fight's own change (a coin row's pace) is printed beside it, never added.
   [name, kind, [best ground, plain, worn], [second ground, plain, worn] | null] */
const COIN_LO = 14, COIN_HI = 26;
const ROWS4 = [
  /* (each kept row reads from its shape's report, the same rule under a temporary id; REPLAY=1 batch4.sh proves the real id plays it) */
  ['#1 Bannerman\'s Pavise (tank): a Challenge, the party -12.5% for 3 s', 'pace', ['Muster Barrows', 'b3-muster-tank', 'b4v-muster-pav-g12s3'], null],
  ['#42 Night Carter\'s Boots (on the healer): an ally hit under 45%, its striker Blunted', 'pace', ['Muster Barrows', 'b3-muster-mixed', 'b4v-muster-boots-ally45'], ['Pyre Field', 'b3-pyre-mixed', 'b4-pyre-boots']],
  ['#24 Stoker\'s Ring (mage): Ice spells Stoke the next Fire spell, +45%', 'pace', ['Pyre Field, its home', 'b3-pyre-mixed', 'b4v-pyre-stoker-45'], ['Muster Barrows', 'b3-muster-mixed', 'b4v-muster-stoker-45']],
  ['#43 Bull\'s Tooth (ranger): single-target hits under 30% land twice', 'pace', ['Wyvern Roost, its home', 'b3-roost-crossbow', 'b4-roost-tooth'], ['Muster Barrows', 'b3-muster-mixed', 'b4v-muster-tooth-x2']],
  /* (lane/pace-step-per-ground: the Key's 36 seeds owed at home, by its real id; its 12-seed shape is k3 below. The Apron, #18, read at home
     once Carter's Rest had its own pace step, its second ground the 12-seed Muster reading of lane/designer-sig-metric) */
  ['#31 The Cellar Key (healer): an ally hit under 30% heals 2%, 30 s an ally, 36 seeds', 'pace', ['Carter\'s Rest, its home', 'b4-carters-mixed36', 'b4-carters-key36'], null],
  ['#18 Brewer\'s Apron (healer): Circle of Renewal, Emboldened 4 s, 36 seeds', 'pace', ['Carter\'s Rest, its home', 'b4-carters-mixed36', 'b4-carters-apron36'], ['Muster Barrows', 'b2-muster-mixed', 'b2m-muster-apron']],
  ['#25 The Cold Candle (mage, coin): every Ice rune spell uses no rune', 'coin', ['Muster Barrows', 'b3-muster-mixed4', 'b4v-muster-candle-all'], null],
  ['#27 Riverstone Earrings (healer, coin): a Water heal, 0.5% of your max mana', 'coin', ['Muster Barrows', 'b3-muster-mixed4', 'b4v-muster-river-s5'], null],
];
/* THE SHAPES TRIED (b4v-*: a temporary id on a scratch copy, ROOT=<copy>): [label, kind, plain, worn] */
const VARIANTS4 = [
  ['#1 a Challenge: the taunted Blunted (Muster)', 'pace', 'b3-muster-tank', 'b4v-muster-pav-blunt'],
  ['#1 a Challenge: Mend ready (Muster)', 'pace', 'b3-muster-tank', 'b4v-muster-pav-mend'],
  ['#1 a Challenge below half health: the taunted Chilled 6 s (scratch filter, Muster)', 'pace', 'b3-muster-tank', 'b4v-muster-pav-lowchill'],
  ['#1 a Challenge below half health: the taunted Blunted (scratch filter, Muster)', 'pace', 'b3-muster-tank', 'b4v-muster-pav-lowblunt'],
  ['#1 a Challenge: the party -10% 4 s (Muster)', 'pace', 'b3-muster-tank', 'b4v-muster-pav-g10'],
  ['#1 a Challenge: the party -10% 3 s (Muster)', 'pace', 'b3-muster-tank', 'b4v-muster-pav-g10s3'],
  ['#1 a Challenge: the party -11% 4 s (Muster)', 'pace', 'b3-muster-tank', 'b4v-muster-pav-g11'],
  ['#1 a Challenge: the party -12.5% 3 s (Muster) KEPT', 'pace', 'b3-muster-tank', 'b4v-muster-pav-g12s3'],
  ['#1 a Challenge: the party -12.5% 4 s (Muster)', 'pace', 'b3-muster-tank', 'b4v-muster-pav-g12'],
  ['#1 a Challenge: the party -15% 4 s (Muster)', 'pace', 'b3-muster-tank', 'b4v-muster-pav-pguard'],
  ['#42 a pull: a shield of 2% a monster, up to 10% (Muster)', 'pace', 'b3-muster-tank', 'b4v-muster-boots-shield'],
  ['#42 a pull: you take 30% less for 6 s (Muster)', 'pace', 'b3-muster-tank', 'b4v-muster-boots-guard'],
  ['#42 under 45%: monsters within 2 tiles Chilled 8 s, 10 s clock (Muster)', 'pace', 'b3-muster-tank', 'b4v-muster-boots-lowchill'],
  ['#42 on the bow: a monster next to you that hits you, Chilled 4 s (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-boots-back'],
  ['#42 on the bow: the same, 8 s (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-boots-back8'],
  ['#42 on the healer: an ally hit under half, its striker Blunted (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-leech-ub'],
  ['#42 the same under 45% (Muster) KEPT', 'pace', 'b3-muster-mixed', 'b4v-muster-boots-ally45'],
  ['#42 the same under 40% (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-boots-ally40'],
  ['#42 the same under 35% (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-boots-ally35'],
  ['#42 the same under 30% (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-boots-ally30'],
  ['#42 the same under half, once every 5 s an ally (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-key-blunt5'],
  ['#26 a shell you cast breaks: Protective Ward ready, 10 s clock (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-thrower-w10'],
  ['#26 the same, 6 s clock (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-thrower-w6'],
  ['#31 an ally hit under 35%: it heals 6%, 8 s an ally (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-key-save'],
  ['#31 an ally hit under 40%: it heals 8%, 8 s an ally (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-key-save2'],
  ['#31 the same (Carter\'s Rest)', 'pace', 'b3-carters-mixed', 'b4v-carters-key-save2'],
  ['#31 under 30%: 4%, 10 s an ally (Carter\'s Rest)', 'pace', 'b3-carters-mixed', 'b4v-carters-key-k1'],
  ['#31 under 30%: 3%, 15 s an ally (Carter\'s Rest)', 'pace', 'b3-carters-mixed', 'b4v-carters-key-k2'],
  ['#31 under 30%: 2%, 30 s an ally (Carter\'s Rest) KEPT', 'pace', 'b3-carters-mixed', 'b4v-carters-key-k3'],
  ['#31 under 30%: 2%, 60 s for the party (Carter\'s Rest)', 'pace', 'b3-carters-mixed', 'b4v-carters-key-k4'],
  ['#24 Ice spells: the next Fire spell +30% (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-stoker-stoked'],
  ['#24 +60% (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-stoker-60'],
  ['#24 +60% (Pyre Field)', 'pace', 'b3-pyre-mixed', 'b4v-pyre-stoker-60'],
  ['#24 +45% (Muster) KEPT', 'pace', 'b3-muster-mixed', 'b4v-muster-stoker-45'],
  ['#24 +45% (Pyre Field) KEPT', 'pace', 'b3-pyre-mixed', 'b4v-pyre-stoker-45'],
  ['#43 single-target hits under 30%: +50% (Muster)', 'pace', 'b3-muster-mixed', 'b4v-muster-tooth-exec'],
  ['#43 single-target hits under 30%: +100% (Muster) KEPT', 'pace', 'b3-muster-mixed', 'b4v-muster-tooth-x2'],
  ['#29 Rupture rune spells lay a second Bleed stack (Muster axes)', 'pace', 'b3-muster-axes', 'b4v-muster-claw-two'],
  ['#25 every other Ice rune spell uses no rune (Muster, 4 seeds)', 'coin', 'b3-muster-mixed4', 'b4v-muster-candle-two'],
  ['#25 every Ice rune spell uses no rune (Muster, 4 seeds) KEPT', 'coin', 'b3-muster-mixed4', 'b4v-muster-candle-all'],
  ['#25 as built, every third (Muster, 4 seeds)', 'coin', 'b3-muster-mixed4', 'b3-muster-candle'],
  ['#27 as built, 10% of the heal to the hero healed (Muster, 4 seeds)', 'coin', 'b3-muster-mixed4', 'b3-muster-riverstone'],
  ['#27 a Water heal: 2% of your max mana (Muster, 4 seeds)', 'coin', 'b3-muster-mixed4', 'b4v-muster-river-s20'],
  ['#27 4% (Muster, 4 seeds)', 'coin', 'b3-muster-mixed4', 'b4v-muster-river-s40'],
  ['#27 0.5% (Muster, 4 seeds) KEPT', 'coin', 'b3-muster-mixed4', 'b4v-muster-river-s5'],
  ['#27 0.3% (Muster, 4 seeds)', 'coin', 'b3-muster-mixed4', 'b4v-muster-river-s3'],
  ['#33 the Mitts on the hammer (Muster, 4 seeds)', 'coin', 'b3-muster-mixed4', 'b4-muster-mitts-hammer'],
  ['#33 the Mitts on the mage (Muster, 4 seeds)', 'coin', 'b3-muster-mixed4', 'b4-muster-mitts-mage'],
];
/* BATCH 4'S OWN ROWS (systems, lane/signatures-batch-4, 2026-11-28; batch4.sh b4s-*): the 14 rows on the engine pieces P1 to P7 and P9,
   each by its real id on the cell 15's rules A to E give it, against batch 3's plain fours (this tree replays them exactly) or a plain four
   played here (the sword four, the Bold mixed four). The pair (#45, #46) reads as one: neither piece does anything without the other, so
   each one's worth to the four that wears both is the pair's. A coin row's fight is printed beside its coin steps, never added.
   [name, kind, [best ground, plain, worn], [second ground, plain, worn] | null] */
const ROWS4B = [
  ['#26 Thrower\'s Ring (healer): a shell you cast breaks, its breaker Blunted', 'pace', ['Muster Barrows', 'b3-muster-mixed', 'b4s-muster-thrower'], null],
  ['#28 Vault Leech Ring (healer): Poison rune spells Sicken the monster on the lowest ally', 'pace', ['Muster Barrows', 'b3-muster-mixed', 'b4s-muster-leech'], null],
  ['#33 Teamster\'s Mitts (sword): Power Strike turns a monster on an ally, 4 s', 'pace', ['Muster Barrows', 'b4s-muster-sword', 'b4s-muster-mitts'], null],
  ['#42 Night Carter\'s Boots (healer): a stalker hits an ally under 45%, its next blow at half', 'pace', ['Muster Barrows', 'b3-muster-mixed', 'b4s-muster-boots'], ['Pyre Field', 'b3-pyre-mixed', 'b4s-pyre-boots']],
  ['#43 Bull\'s Tooth (ranger): single-target hits on a brute under 30% land twice', 'pace', ['Wyvern Roost, its home', 'b3-roost-crossbow', 'b4s-roost-tooth'], ['Muster Barrows', 'b3-muster-mixed', 'b4s-muster-tooth']],
  /* (the Plate CUT to 4%: its reading is the 4% shape's, b4w-muster-plate4, the same rule under a temporary id; REPLAY=1 batch4.sh plays its
     first two seeds by its real id, equal) */
  ['#35 Gatekeeper\'s Plate (tank): you and allies within 2 tiles take 4% less (CUT from 8%)', 'pace', ['Muster Barrows', 'b3-muster-tank', 'b4w-muster-plate4'], null],
  /* (the pair as set: the Rein cut to 7.5% after its own half read 19.0 at 15%, the Bell at 30%; as built, 15%, among the shapes) */
  ['#45 Convoy Bell + #46 Lead Rein (healer + tank), the pair as set (the Rein at 7.5%)', 'pace', ['Muster Barrows', 'b3-muster-tank', 'b4s-muster-pair2'], null],
  ['#40 Hearth Mason\'s Cloak (healer), on Bold', 'pace', ['Muster Barrows, Bold', 'b4s-muster-bold', 'b4s-muster-cloak'], null],
  ['#44 Pyre Priest\'s Hood (mage): over 70% health, spells cost health', 'pace', ['Muster Barrows', 'b3-muster-mixed', 'b4s-muster-hood'], null],
  ['#44 Pyre Priest\'s Hood (mage, coin): the same reading on the coin bar', 'coin', ['Muster Barrows', 'b3-muster-mixed', 'b4s-muster-hood'], null],
  ['#32 Ledger Ring (mage, coin): every fifth spell costs no mana', 'coin', ['Muster Barrows', 'b3-muster-mixed4', 'b4s-muster-ledger'], null],
  ['#37 Lychgate Leggings (healer, coin): under 30% mana, heals free for 5 s, 90 s clock', 'coin', ['Muster Barrows', 'b3-muster-mixed4', 'b4s-muster-leggings'], null],
  ['#41 Brood Bracers (ranger, coin): every fifth arrow that hits costs no arrow', 'coin', ['Muster Barrows', 'b3-muster-mixed4', 'b4s-muster-bracers'], null],
  ['#34 Sergeant\'s Sash (healer, coin): allies within 8 tiles regenerate 20% more mana', 'coin', ['Muster Barrows', 'b3-muster-mixed4', 'b4s-muster-sash'], null],
];
/* BATCH 4'S SHAPES (b4w-*: a temporary id on a scratch copy, batch4.sh): the over rows' numbers, and the pair's halves apart (each piece's
   effect with its partner worn inert, so the other half plays nothing) */
const VARIANTS4B = [
  ['#35 the Plate as built, 8% (Muster, the tank four)', 'pace', 'b3-muster-tank', 'b4s-muster-plate'],
  ['#35 the Plate at 4% (Muster, the tank four) KEPT', 'pace', 'b3-muster-tank', 'b4w-muster-plate4'],
  ['#35 the Plate at 2.5% (Muster, the tank four)', 'pace', 'b3-muster-tank', 'b4w-muster-plate25'],
  ['#45 + #46 as built: +30% heals, -15% taken (Muster)', 'pace', 'b3-muster-tank', 'b4s-muster-pair'],
  ['#45 the Bell\'s half alone: +30% heals on the tank under half (Muster)', 'pace', 'b3-muster-tank', 'b4w-muster-bell'],
  ['#46 the Rein\'s half alone: the tank -15% under half (Muster)', 'pace', 'b3-muster-tank', 'b4w-muster-rein'],
  ['#45 + #46 at half size: +15% heals, -7.5% taken (Muster)', 'pace', 'b3-muster-tank', 'b4w-muster-pair-half'],
  ['#46 the Rein\'s half alone at -7.5% (Muster)', 'pace', 'b3-muster-tank', 'b4w-muster-rein75'],
];
if (BATCH === '4') {
  const net = (c) => c.gold.incomePerHeroH.mean - c.gold.storePerHeroH.mean;
  const coinSteps = (p, s) => ((p.gold.storePerHeroH.mean - s.gold.storePerHeroH.mean) * 4 * 100) / net(p) / stepOf(p);
  const coinBar = (x) => (x > COIN_HI ? 'OVER (cut its number)' : x < COIN_LO ? 'UNDER (raise or reshape)' : 'in band');
  const read = (x, bp) => { if (!x) return { none: true }; const [g, a, b] = x; const p = cellOf(a), s = cellOf(b); return p && s ? { g, p, s, h: heldOf(p, s), q: paceOf(p, s, bp) } : { g, owed: true }; };
  console.log('| Signature | Kind | Best cell | Held delta (se, seeds) | Pace steps (se) | Coin steps | Kills/h | Second ground | Its pace steps (se) | Bar | Spread bar (second <= half the best) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  /* (batch 4's own rows first, then batch 3's reshaped under rows, lane/designer-sig-batch4) */
  for (const [name, kind, best, other] of ROWS4B.concat(ROWS4)) {
    const B = read(best), O = read(other, B.p);
    if (B.owed) { console.log('| ' + [name, kind, best[0], 'owed', '', '', '', '', '', '', ''].join(' | ') + ' |'); continue; }
    const coin = coinSteps(B.p, B.s);
    const bar = kind === 'coin' ? coinBar(coin) + ' (coin bar 20 +- 6)' : sizeOf(B.q);
    const under = kind === 'pace' && !!B.q && B.q.m < LO;
    const spread = kind === 'coin' ? 'n/a (the coin bar)' : under ? 'n/a (under its size)' : O.none ? 'no second cell' : O.owed || !O.q ? 'not read'
      : O.q.m <= B.q.m / 2 ? 'holds' : O.q.m - O.q.se <= B.q.m / 2 ? 'holds within its se' : 'FAILS (big everywhere: reshape)';
    console.log('| ' + [name, kind, B.g, show(B.h, true), show(B.q), sgn(coin), pct(B.s.killsPerH, B.p.killsPerH), O.none ? '' : O.g,
      O.none ? '' : O.owed ? 'owed' : show(O.q), bar, spread].join(' | ') + ' |');
  }
  console.log('\n| Shape tried | Kind | Held delta (se, seeds) | Pace steps (se) | Coin steps | Bar | Kills/h |\n|---|---|---|---|---|---|---|');
  for (const [name, kind, a, b] of VARIANTS4B.concat(VARIANTS4)) {
    const p = cellOf(a), s = cellOf(b), h = p && s ? heldOf(p, s) : null, q = p && s ? paceOf(p, s) : null;
    const coin = p && s ? coinSteps(p, s) : null;
    console.log('| ' + [name, kind, h ? show(h, true) : 'owed', q ? show(q) : 'owed', coin === null ? 'owed' : sgn(coin),
      !p || !s ? '' : kind === 'coin' ? coinBar(coin) : q ? sizeOf(q) : '', p && s ? pct(s.killsPerH, p.killsPerH) : ''].join(' | ') + ' |');
  }
  process.exit(0);
}

/* BATCH 5 (game designer, lane/designer-sig-batch5, batch5.sh): batch 4's out-of-band rows and batch 3's rows the per-ground re-read moved,
   reshaped, against the plain fours this tree replays (b3-*, b4-*) or played here (b5-*). A FIGHT row reads pace steps, a COIN row coin
   steps (rule C), as batch 4. A BOLD row (rule F, 15 "Batch 4's calls and the out-of-band rows, ruled": a Signature whose worth is the
   deaths it turns away) reads its whole hunt on Bold, paired by seed: the Level XP the four KEPT (earned less what its deaths took,
   v1-climb --raw levelXp - xpLostLevel) a hero over the hunt's wall hours, as a % of the plain four's, in the ground's pace step. The
   held start cannot pair a Bold four: its first death ends the four before hour 4 on most seeds.
   [name, kind, [best ground, plain, worn], [second ground, plain, worn] | null] */
/* (each set or kept row as it stands; a set row reads from its shape's report, the same rule under a temporary id, and REPLAY=1
   batch5.sh plays its first two seeds by its real id. The cut rows' shapes are VARIANTS5) */
const ROWS5 = [
  ['#19 Lock-Keeper's Chain (healer): a hero near fall-back, Spring Tide ready, once a minute', 'pace', ['Muster Barrows', 'b3-muster-mixed', 'b5v-muster-chain60'], ['The Slake (batch 3, at 30 s)', 'b3-slake-mixed', 'b3-slake-chain']],
  ['#23 Ferry Pennies (tank): a Mend under 45%, Blunted next to you, as built', 'pace', ['Muster Barrows', 'b3-muster-tank', 'b5-muster-pennies45'], null],
  ['#4 Charred Saber (sword): Flame Strike's target Blunted, as built, 24 seeds', 'pace', ['Pyre Field', 'b5-pyre-sword24', 'b5-pyre-sabre24'], null],
  ['#43 Bull's Tooth (ranger): single-target hits on a brute under half land twice', 'pace', ['Muster Barrows', 'b3-muster-mixed', 'b5v-muster-tooth50'], ['Wyvern Roost, its home', 'b3-roost-crossbow', 'b5v-roost-tooth50']],
  ['#31 The Cellar Key (healer): an ally hit under 30% heals 3%, 20 s an ally, 36 seeds', 'pace', ['Carter's Rest, its home', 'b4-carters-mixed36', 'b5v-carters-key3-20'], null],
  ['#28 Vault Leech Ring (healer): Poison rune spells heal the lowest hurt ally LEECH_PCT of their damage, 36 seeds', 'pace', ['Carter's Rest', 'b4-carters-mixed36', 'LEECH_REPORT'], ['Muster Barrows (at 50%)', 'b3-muster-mixed', 'b5v-muster-leech-h50']],
  ['#32 Ledger Ring (mage, coin): every fourth spell costs no mana', 'coin', ['Muster Barrows', 'b3-muster-mixed4', 'b5v-muster-ledger4'], null],
  ['#41 Brood Bracers (ranger, coin): every third arrow that hits, the next shot costs none', 'coin', ['Muster Barrows', 'b3-muster-mixed4', 'b5v-muster-bracers3'], null],
  ['#37 Lychgate Leggings (healer, coin): under half mana, heals free for 5 s, 40 s clock', 'coin', ['Muster Barrows', 'b3-muster-mixed4', 'b5v-muster-leg50-5-40'], null],
  ['#25 The Cold Candle (mage, coin): Frost Lance uses no runes (scratch `saves.of`)', 'coin', ['Muster Barrows', 'b3-muster-mixed4', 'b5v-muster-candle-lance'], null],
  ['#40 Hearth Mason's Cloak (healer), Bold: CLOAK_LABEL, 36 seeds', 'bold', ['Muster Barrows, Bold', 'b5-muster-bold', 'CLOAK_REPORT', 'b5-muster-steady36'], null],
];
/* THE SHAPES AND RE-READS (b5v-*, b5-*): [label, kind, plain, worn] */
const VARIANTS5 = [
  ['#23 Ferry Pennies as it stands, under 45% (Muster, the tank four, this tree)', 'pace', 'b3-muster-tank', 'b5-muster-pennies45'],
  ['#23 under 40% (Muster)', 'pace', 'b3-muster-tank', 'b5v-muster-pennies40'],
  ['#4 Charred Saber as it stands, Blunted on its target (Pyre, the sword four, this tree)', 'pace', 'b5-pyre-sword', 'b5-pyre-sabre'],
  ['#26 monsters that hit a shield you cast: Weakened 8 s (Muster)', 'pace', 'b3-muster-mixed', 'b5v-muster-thrower-weak'],
  ['#26 the same, Sapped 6 s (Muster)', 'pace', 'b3-muster-mixed', 'b5v-muster-thrower-sap'],
  ['#28 Poison rune spells heal the lowest ally 50% of their damage (Muster)', 'pace', 'b3-muster-mixed', 'b5v-muster-leech-h50'],
  ['#28 the same, 100% (Muster)', 'pace', 'b3-muster-mixed', 'b5v-muster-leech-h100'],
  ['#42 a caster hits an ally under 45% (the Bone Wing)', 'pace', 'b5-bone-mixed', 'b5v-bone-boots-caster'],
  ['#42 the same (the Flooded Wing, the axes four)', 'pace', 'b5-flood-axes', 'b5v-flood-boots-caster'],
  ['#42 the same (Pyre Field)', 'pace', 'b3-pyre-mixed', 'b5v-pyre-boots-caster'],
  ['#43 a brute under half (Muster)', 'pace', 'b3-muster-mixed', 'b5v-muster-tooth50'],
  ['#43 the same (Wyvern Roost)', 'pace', 'b3-roost-crossbow', 'b5v-roost-tooth50'],
  ['#33 the Mitts on the tank four (Muster)', 'pace', 'b3-muster-tank', 'b5-muster-mitts-tank'],
  ['#33 Power Strike on a monster attacking an ally: its next blow at half (Muster, the sword four; scratch `onAlly`)', 'pace', 'b4s-muster-sword', 'b5v-muster-mitts-blunt'],
  ['#33 the same (Muster, the tank four)', 'pace', 'b3-muster-tank', 'b5v-muster-mitts-blunt-tank'],
  ['#19 Lock-Keeper\'s Chain as it stands, once every 30 s (Muster, batch 3)', 'pace', 'b3-muster-mixed', 'b3-muster-chain'],
  ['#19 once every 40 s (Muster)', 'pace', 'b3-muster-mixed', 'b5v-muster-chain40'],
  ['#19 once every 60 s (Muster)', 'pace', 'b3-muster-mixed', 'b5v-muster-chain60'],
  ['#19 once every 90 s (Muster)', 'pace', 'b3-muster-mixed', 'b5v-muster-chain90'],
  ['#4 Charred Saber as it stands, 24 seeds (Pyre, the sword four)', 'pace', 'b5-pyre-sword24', 'b5-pyre-sabre24'],
  ['#33 Power Strike while you are under half health: heal 8% of your max (Muster, the sword four; scratch `selfBelowPm`)', 'pace', 'b4s-muster-sword', 'b5v-muster-mitts-heal8'],
  ['#33 the same (Muster, the tank four)', 'pace', 'b3-muster-tank', 'b5v-muster-mitts-heal8-tank'],
  ['#33 Power Strike: its target Sickened (takes 10% more, 6 s) (Muster, the sword four)', 'pace', 'b4s-muster-sword', 'b5v-muster-mitts-sick'],
  ['#26 monsters that hit a shield you cast: their next blow at half (Muster)', 'pace', 'b3-muster-mixed', 'b5v-muster-thrower-blunt'],
  ['#18 Brewer\'s Apron, Circle of Renewal on a hero under half: +4% of its max health (Carter\'s Rest, 36 seeds)', 'pace', 'b4-carters-mixed36', 'b5v-carters-apron-h4'],
  ['#31 The Cellar Key, 3% once every 20 s (Carter\'s Rest, 36 seeds)', 'pace', 'b4-carters-mixed36', 'b5v-carters-key3-20'],
  ['#28 Vault Leech Ring, 100% to the lowest ally (Carter\'s Rest, 36 seeds)', 'pace', 'b4-carters-mixed36', 'b5v-carters-leech-h100'],
  ['#28 the same at 50% (Carter\'s Rest, 36 seeds)', 'pace', 'b4-carters-mixed36', 'b5v-carters-leech-h50'],
  ['#28 the same at 60% (Carter\'s Rest, 36 seeds)', 'pace', 'b4-carters-mixed36', 'b5v-carters-leech-h60'],
  ['#28 the same at 70% (Carter\'s Rest, 36 seeds)', 'pace', 'b4-carters-mixed36', 'b5v-carters-leech-h70'],
  ['#18 Brewer\'s Apron, Circle of Renewal: each hero it heals takes 15% less for 4 s (Carter\'s Rest, 36 seeds)', 'pace', 'b4-carters-mixed36', 'b5v-carters-apron-g15'],
  ['#18 the same (Muster)', 'pace', 'b3-muster-mixed', 'b5v-muster-apron-g15'],
  ['#38 Drowned Signet: under half health, you deal 25% more for 4 s, once every 20 s (Muster, the sword four)', 'pace', 'b4s-muster-sword', 'b5v-muster-signet-low'],
];
/* the coin shapes (4 seeds against batch 3's 4-seed plain four): [label, plain, worn] */
const COIN5 = [
  ['#32 Ledger Ring, every fourth spell (Muster)', 'b3-muster-mixed4', 'b5v-muster-ledger4'],
  ['#41 Brood Bracers, a credit after three landed (Muster)', 'b3-muster-mixed4', 'b5v-muster-bracers3'],
  ['#37 Lychgate Leggings under 30% mana, 10 s, 30 s clock (Muster)', 'b3-muster-mixed4', 'b5v-muster-leg10-30'],
  ['#37 under half mana, 10 s, 30 s clock (Muster)', 'b3-muster-mixed4', 'b5v-muster-leg50-10'],
  ['#37 under half mana, 15 s, 30 s clock (Muster)', 'b3-muster-mixed4', 'b5v-muster-leg50-15'],
  ['#37 under half mana, 5 s, 30 s clock (Muster)', 'b3-muster-mixed4', 'b5v-muster-leg50-5'],
  ['#37 under 40% mana, 10 s, 30 s clock (Muster)', 'b3-muster-mixed4', 'b5v-muster-leg40-10'],
  ['#37 under half mana, 5 s, 40 s clock (Muster)', 'b3-muster-mixed4', 'b5v-muster-leg50-5-40'],
  ['#37 under half mana, 5 s, 45 s clock (Muster)', 'b3-muster-mixed4', 'b5v-muster-leg50-5-45'],
  ['#25 The Cold Candle, Frost Lance only (Muster; scratch `saves.of`)', 'b3-muster-mixed4', 'b5v-muster-candle-lance'],
];
/* [label, the plain four on Bold, worn on Bold, the plain four on Steady]: the worn four against the plain stance that keeps more */
const BOLD5 = [
  ['#40 the Cloak as built, once an hour (Muster, Bold)', 'b5-muster-bold', 'b5-muster-cloak', 'b5-muster-steady'],
  ['#40 once a hunt (a 10 h clock) (Muster, Bold)', 'b5-muster-bold', 'b5v-muster-cloak-hunt', 'b5-muster-steady'],
  /* (36 seeds: a death moves a seed's Level XP kept by about a fifth, so 12 seeds read se 22) */
  ['#40 once an hour, 36 seeds (Muster, Bold)', 'b5-muster-bold', 'b5-muster-cloak36', 'b5-muster-steady36'],
  ['#40 once every 90 minutes, 36 seeds (Muster, Bold)', 'b5-muster-bold', 'b5v-muster-cloak-90m36', 'b5-muster-steady36'],
  ['#40 once every 2 hours, 36 seeds (Muster, Bold)', 'b5-muster-bold', 'b5v-muster-cloak-2h36', 'b5-muster-steady36'],
  ['#40 once every 3 hours, 36 seeds (Muster, Bold)', 'b5-muster-bold', 'b5v-muster-cloak-3h36', 'b5-muster-steady36'],
  ['#40 once a hunt, 36 seeds (Muster, Bold)', 'b5-muster-bold', 'b5v-muster-cloak-hunt36', 'b5-muster-steady36'],
];
if (BATCH === '5') {
  const net = (c) => c.gold.incomePerHeroH.mean - c.gold.storePerHeroH.mean;
  const coinSteps = (p, s) => ((p.gold.storePerHeroH.mean - s.gold.storePerHeroH.mean) * 4 * 100) / net(p) / stepOf(p);
  const coinBar = (x) => (x > COIN_HI ? 'OVER (cut its number)' : x < COIN_LO ? 'UNDER (raise or reshape)' : 'in band');
  /* a Bold four's seeds as v1-climb --raw keeps them: { seed: { kept a hero-hour of wall time, deaths } } */
  const rawOf = (name) => {
    const f = join(HERE, name + '.raw.json');
    if (!existsSync(f)) return null;
    const r = JSON.parse(readFileSync(f, 'utf8')), hours = cellOf(name).hours || 8, by = {};
    for (const [k, o] of Object.entries(r)) {
      const s = Number(k.split('#')[1]);
      const kept = o.heroes.reduce((a, h) => a + (h.levelXp || 0) - (h.xpLostLevel || 0), 0);
      by[s] = { kept: kept / (o.heroes.length * hours), deaths: o.heroes.reduce((a, h) => a + h.deaths, 0) };
    }
    return by;
  };
  /* (rule F: against the plain four's better stance, Bold or Steady by its mean kept, so a piece is worth what it adds over the best play
     without it; paired by seed on that stance) */
  const meanKept = (o) => Object.values(o).reduce((x, y) => x + y.kept, 0) / Math.max(1, Object.keys(o).length);
  const boldOf = (a, b, c) => {
    const pb = rawOf(a), s = rawOf(b), ps = c ? rawOf(c) : null;
    if (!pb || !s) return null;
    const p = ps && meanKept(ps) > meanKept(pb) ? ps : pb, vs = p === pb ? 'Bold' : 'Steady';
    const k = stepOf(cellOf(a));
    const d = Object.keys(p).filter((x) => s[x] && p[x].kept > 0).map((x) => ((s[x].kept / p[x].kept - 1) * 100) / k);
    const deaths = (o) => Object.values(o).reduce((x, y) => x + y.deaths, 0);
    return { q: stats(d), vs, deaths: deaths(pb) + ' in ' + Object.keys(pb).length + ' seeds to ' + deaths(s) + ' in ' + Object.keys(s).length, kept: [meanKept(pb), ps ? meanKept(ps) : null, meanKept(s)].map((x) => (x === null ? 'n/a' : Math.round(x))) };
  };
  const read = (x, bp) => { if (!x) return { none: true }; const [g, a, b] = x; const p = cellOf(a), s = cellOf(b); return p && s ? { g, p, s, h: heldOf(p, s), q: paceOf(p, s, bp) } : { g, owed: true }; };
  console.log('| Signature | Kind | Best cell | Held delta (se, seeds) | Pace, coin or Bold steps (se) | Kills/h | Second ground | Its pace steps (se) | Bar | Spread bar (second <= half the best) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const [name, kind, best, other] of ROWS5) {
    const B = read(best), O = read(other, B.p);
    if (B.owed) { console.log('| ' + [name, kind, best[0], 'owed', '', '', '', '', '', ''].join(' | ') + ' |'); continue; }
    const bold = kind === 'bold' ? boldOf(best[1], best[2], best[3]) : null;
    const q = kind === 'bold' ? (bold && bold.q) : B.q;
    const val = kind === 'coin' ? sgn(coinSteps(B.p, B.s)) + ' coin' : kind === 'bold' ? (q ? show(q, true) + ' Bold steps vs plain ' + bold.vs + ', deaths ' + bold.deaths : 'owed (--raw)') : show(B.q);
    const bar = kind === 'coin' ? coinBar(coinSteps(B.p, B.s)) + ' (coin bar 20 +- 6)' : sizeOf(q);
    const under = kind === 'pace' && !!B.q && B.q.m < LO;
    const spread = kind !== 'pace' ? 'n/a' : under ? 'n/a (under its size)' : O.none ? 'no second cell' : O.owed || !O.q ? 'not read'
      : O.q.m <= B.q.m / 2 ? 'holds' : O.q.m - O.q.se <= B.q.m / 2 ? 'holds within its se' : 'FAILS (big everywhere: reshape)';
    console.log('| ' + [name, kind, B.g, show(B.h, true), val, pct(B.s.killsPerH, B.p.killsPerH), O.none ? '' : O.g,
      O.none ? '' : O.owed ? 'owed' : show(O.q), bar, spread].join(' | ') + ' |');
  }
  console.log('\n| Shape or re-read | Kind | Held delta (se, seeds) | Pace steps (se) | Bar | Kills/h |\n|---|---|---|---|---|---|');
  for (const [name, kind, a, b] of VARIANTS5) {
    const p = cellOf(a), s = cellOf(b), h = p && s ? heldOf(p, s) : null, q = p && s ? paceOf(p, s) : null;
    console.log('| ' + [name, kind, h ? show(h, true) : 'owed', q ? show(q) : 'owed', q ? sizeOf(q) : '', p && s ? pct(s.killsPerH, p.killsPerH) : ''].join(' | ') + ' |');
  }
  console.log('\n| Coin shape | Coin steps | Fight, pace steps (se) | Bar |\n|---|---|---|---|');
  for (const [name, a, b] of COIN5) {
    const p = cellOf(a), s = cellOf(b), q = p && s ? paceOf(p, s) : null;
    console.log('| ' + [name, p && s ? sgn(coinSteps(p, s)) : 'owed', q ? show(q) : '', p && s ? coinBar(coinSteps(p, s)) : ''].join(' | ') + ' |');
  }
  console.log('\n| Bold shape | Kept a hero-hour: plain Bold, plain Steady, worn | Against | Bold steps (se, seeds) | Deaths on Bold, plain to worn (12 seeds x 8 h) | Bar |\n|---|---|---|---|---|---|');
  for (const [name, a, b, c] of BOLD5) {
    const r = cellOf(a) && cellOf(b) && cellOf(c) ? boldOf(a, b, c) : null;
    console.log('| ' + [name, r ? r.kept.join(', ') : 'owed', r ? 'plain ' + r.vs : '', r && r.q ? show(r.q, true) : 'owed', r ? r.deaths : '', r && r.q ? sizeOf(r.q) : ''].join(' | ') + ' |');
  }
  process.exit(0);
}

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
  const read = ([g, a, b], bp) => { const p = cellOf(a), s = cellOf(b); return p && s ? { g, p, s, h: heldOf(p, s), q: paceOf(p, s, bp) } : { g, owed: true }; };
  const B = read(best), O = read(other, B.p);
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
  console.log('| ' + [name, h ? show(h, true) : 'owed', q ? show(q) : p && s ? 'no pay window' : 'owed', q ? sizeOf(q) : '', p && s ? pct(s.killsPerH, p.killsPerH) : ''].join(' | ') + ' |');
}
console.log('\n| Luck ceiling (V10 stand-in) | Held delta (se, seeds) | Pace steps (se) | Gear slice (20) |\n|---|---|---|---|');
for (const [name, a, b] of LUCKY) {
  const p = cellOf(a), s = cellOf(b), h = p && s ? heldOf(p, s) : null, q = p && s ? paceOf(p, s) : null;
  console.log('| ' + [name, h ? show(h, true) : 'owed', q ? show(q) : 'owed', !q ? '' : q.m <= 20 ? 'inside' : q.m - q.se <= 20 ? 'inside within its se' : 'OVER'].join(' | ') + ' |');
}
for (const [name, a, b, top] of PINNED) {
  const p = cellOf(a), s = cellOf(b), h = p && s ? heldOf(p, s) : null;
  if (h) console.log('\npinned: ' + name + ': the plain four holds ' + p.held.mean.toFixed(1) + ' of the ground\'s top ' + top + ', the Signature ' + sgn(h.m) + ' (' + h.se.toFixed(1) + ') held');
}
