#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/stage3/candidates.mjs — THE STAGE 0 ACCEPTANCE CELLS OF THE AMOUNT PIPELINE (lane/stage3-pipeline;
// 27-formula-overhaul.md section 5, 04-math-strategy.md section 14). Writes Lab candidates (tools/balance-program/candidates.mjs schema)
// into an output directory; tools/balance-program/redesign/v1-climb.mjs plays each with --candidate <path>.
//
//   node tools/balance-program/redesign/stage3/candidates.mjs [--out .scratch/stage3]
//
// THE SCALE TEST (04 section 14 stage 0, test 1): the reference company at a gap of 0 at Levels 30, 300 and 3,000 must read the same
// seconds to kill, lowest health, fight share, supply use and share of a Level an hour. Muster Barrows is MOVED to Level L as content
// would be written there, and nothing in the engine is touched:
//   - its row's refLevel and gearLevel are L (src/data/danger.js), so the reference company at Level L in its kit is a gap of 0
//   - its monsters' health and blow are the same SHARES of the reference health of Level L (the dial's `each` x refHealth(L) /
//     refHealth(60): what monster-formula writes from role rows; the rows today are typed at Level 60)
//   - every piece's item Level is L - 60 higher (the same kit, L - 60 Levels up), and every hero's skill sits on its line (skillGapPm 0)
//   - the roll to hit is off (AMOUNT.hitRoll false): today's to-hit ratio reads skill and rows typed by Level, so it cannot pass a scale
//     test by construction (27 K-2: it goes). Level 60 is played the same way, so the four cells differ only in the Level.
// THE BEFORE TREE: `before` plays the merged base without the pipeline (base: { ref }), the comparison for the reduced matrix.
//
// Exit 0 wrote · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = resolve(ROOT, arg('out', '.scratch/stage3'));
const BEFORE = arg('before', '6b892cfac');
const { refHealth } = await import(pathToFileURL(join(ROOT, 'src/core/hunt/amount.js')).href);
mkdirSync(OUT, { recursive: true });

const SCHEMA = 'hearthrise.balance-candidate/1';
const hitOff = { file: 'src/data/amount.js', from: '  hitRoll: true,', to: '  hitRoll: false,' };
const onLine = { file: 'src/core/member.js', from: 'const skillGapPm = skillLv === null ? 0 : skillLv - 1000 * level;', to: 'const skillGapPm = 0;' };
const write = (c) => { writeFileSync(join(OUT, c.id + '.json'), JSON.stringify({ schema: SCHEMA, ...c }, null, 1) + '\n'); console.log('wrote ' + join(OUT, c.id + '.json')); };

for (const L of [30, 60, 300, 3000]) {
  const d = L - 60, k = refHealth(L) / refHealth(60);
  write({ id: 'stage3-scale-' + L, why: 'the scale test at Level ' + L + ': Muster moved to Level ' + L + ' as shares, the roll to hit off', base: 'tree',
    edits: [hitOff, onLine,
      { file: 'src/data/danger.js', from: "gearLevel: tierLevel(3), ladderTier: 5, traits: traitPool('muster_barrows'), entryLevel: 55, refLevel: 60 })",
        to: 'gearLevel: ' + L + ", ladderTier: 5, traits: traitPool('muster_barrows'), entryLevel: " + Math.max(1, 55 + d) + ', refLevel: ' + L + ' })' },
      /* the supplies' and the moves' typed numbers (a food's HP, a drink's and a move's mana) are shares of Level 60's reference, as the rows were
         written: moved with the content (amount.js reads them against the ground's refLevel, which this candidate moved) */
      ...(d ? [{ file: 'src/core/hunt/amount.js', from: '  const L0 = refLevelOf(inst.ground);\n  return Math.max(1, Math.round((n * refMana(lvOf(u))) / refMana(L0)));', to: '  const L0 = 60;\n  return Math.max(1, Math.round((n * refMana(lvOf(u))) / refMana(L0)));' },
        { file: 'src/core/hunt/amount.js', from: '  const L0 = refLevelOf(inst.ground), L = lvOf(u);', to: '  const L0 = 60, L = lvOf(u);' }] : []),
      ...(d ? [{ file: 'src/core/hunt/danger.js', from: '  const each = 1000 * powStep(1 + DANGER.powerStep, s) * share;', to: '  const each = 1000 * powStep(1 + DANGER.powerStep, s) * share * ' + k + ';' },
        /* (a piece Muster drops carries the moved row's gearLevel as its iL already, src/data/danger.js scaleItemLevels: only a reqLv moves) */
        { file: 'src/core/hunt/danger.js', from: '  const n = Math.floor(Number(it && (Number.isInteger(it.iL) ? it.iL : it.reqLv)));',
          to: '  const n = Math.floor(Number(it && (Number.isInteger(it.iL) ? it.iL : Math.max(1, it.reqLv + ' + d + '))));' }] : [])],
    assumptions: ['content (monster rows, item Levels, skills) moved to Level ' + L + ' as shares; the engine untouched'] });
}
/* the roll to hit off on today's Muster: the switch's own reading (27 K-2) */
write({ id: 'stage3-hit-off', why: 'the roll to hit off (AMOUNT.hitRoll false), everything else the tree', base: 'tree', edits: [hitOff], assumptions: [] });
/* the roll to hit off with the monster side re-normalized (04 section 14 stage 1: pressurePm by bisection so the reference four holds its
   reference step again): every monster blow now lands, so pressure falls by about the monsters' old hit rate */
for (const p of [200, 250]) {
  write({ id: 'stage3-hit-off-p' + p, why: 'the roll to hit off, pressurePm ' + p, base: 'tree',
    edits: [hitOff, { file: 'src/data/amount.js', from: '  pressurePm: 450,', to: '  pressurePm: ' + p + ',' }], assumptions: [] });
}
/* the merged base before the pipeline (the comparison) */
write({ id: 'stage3-before', why: 'the tree before the amount pipeline (' + BEFORE + ')', base: { ref: BEFORE }, assumptions: [] });
