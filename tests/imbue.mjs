#!/usr/bin/env node
// mutant-rule-functions: pure
// ════════════════════════════════════════════════════════════════════════
// tests/imbue.mjs — IMBUEMENTS' ROWS AND ARITHMETIC, PROVEN IN NODE (lane/flame-temper-build, 2026-11-22; 21-flame-temper-imbue-loot.md
// section 3; src/data/imbue-rules.js, src/core/imbue.js; the timer and the apply verb are 1063-flame-temper.sql's, run by its §7).
//
//   node tests/imbue.mjs            the rules
//   node tests/imbue.mjs --mutate   every planted defect must turn a rule RED
//
// ci-step: economy-selftests | Imbuement rows (one of each kind a slot, a part from another ground, no family keys), life and the fee
// ci-run: node tests/imbue.mjs
// ci-run: node tools/mutant-gate.mjs node tests/imbue.mjs --mutate
//
// mutant-anchors: src/core/imbue.js src/data/imbue-rules.js
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tests/_pure-guard.mjs planted)
//
//   IM-1  THE ROWS: the sample of five, Edge on the weapon, Ward on the body, Leech on the helmet; every part from a ground other than its
//         best one; no family key, no in_fight, no flat row; one stacking key each (the data's validator, and planted rows it must refuse)
//   IM-2  LIFE: plain 20, fine 25, master 30 hunted hours (D-7); no quality, no life
//   IM-3  THE FEE: 0.4 h of wage at the piece's item Level x ramp(hero Level) (a Level 60 hero pays 30%), whole gold
//   IM-4  THE BAND is the part's home ground's entry Level
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runPureGuard } from './_pure-guard.mjs';

async function pure(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href + '?t=' + Date.now());
  const [D, C, wage] = await Promise.all([imp('src/data/imbue-rules.js'), imp('src/core/imbue.js'), imp('src/data/wage.js')]);
  const out = [];
  /* IM-1 */
  for (const p of D.validateImbues()) out.push('IM-1 ' + p);
  const ids = Object.keys(D.IMBUE_RULES).sort().join();
  if (ids !== 'brute_edge,fire_edge,fire_ward,life_leech,mana_leech') out.push('IM-1 the sample is ' + ids);
  if (C.imbueSlotOf('fire_ward') !== 'body' || C.imbueSlotOf('brute_edge') !== 'weapon' || C.imbueSlotOf('life_leech') !== 'helmet' || C.imbueSlotOf('nope') !== null) out.push('IM-1 a kind sits in the wrong slot');
  const plant = (patch, want) => {
    const got = D.validateImbues({ ...D.IMBUE_RULES, brute_edge: { ...D.IMBUE_RULES.brute_edge, ...patch } });
    if (!got.some((p) => p.includes(want))) out.push('IM-1 a planted row (' + JSON.stringify(patch) + ') was not refused: ' + got.join('; '));
  };
  plant({ when: { metric: 'in_fight', eq: true } }, 'in_fight');
  plant({ when: { metric: 'target_family', eq: 'undead' } }, 'family');
  plant({ when: null }, 'flat number');
  plant({ best: { ground: 'pyre_field', seat: 'melee' } }, 'own best ground');
  plant({ kind: 'charm' }, 'has no slot');
  /* IM-2 */
  const H = 3600000;
  if (C.lifeMs('plain') !== 20 * H || C.lifeMs('fine') !== 25 * H || C.lifeMs('master') !== 30 * H || C.lifeMs('epic') !== 0) out.push('IM-2 life is not 20 / 25 / 30 hunted hours');
  /* IM-3 */
  if (C.applyFee(120, 200) !== Math.ceil(0.4 * wage.wage(120))) out.push('IM-3 the fee at full ramp is ' + C.applyFee(120, 200) + ', want 0.4 h of ' + wage.wage(120));
  if (C.applyFee(60, 60) !== Math.ceil((400 * wage.wage(60) * 60) / 200000)) out.push('IM-3 a Level 60 hero does not pay 30% of the fee');
  if (C.applyFee(60, 0) !== 0 || C.applyFee(60, 999) !== C.applyFee(60, 200)) out.push('IM-3 the ramp is not held to 0..1');
  /* IM-4 */
  if (D.imbueBandOf('brute_edge') !== 70 || D.imbueBandOf('mana_leech') !== 55 || D.imbueBandOf('nope') !== null) out.push('IM-4 a band is not its part\'s home ground\'s entry Level');
  return out;
}

const MUTANTS = [
  ['in_fight passes as a condition', 'src/data/imbue-rules.js', "if (r.when && r.when.metric === 'in_fight')", 'if (false)'],
  ['a part from its own best ground passes', 'src/data/imbue-rules.js', 'else if (home.ground === r.best.ground)', 'else if (false)'],
  ['a flat row passes', 'src/data/imbue-rules.js', 'if (!r.when && !r.convert && !r.leech)', 'if (false)'],
  ['quality sets no life', 'src/core/imbue.js', '(1000 + IMBUE.lifeRungPm * rung)', '(1000)'],
  ['the fee ignores the ramp', 'src/core/imbue.js', 'const L = Math.max(0, Math.min(POWER_LEDGER.rampLevel, Math.floor(Number(heroLevel) || 0)));', 'const L = POWER_LEDGER.rampLevel;'],
  ['the band is the best ground\'s', 'src/data/imbue-rules.js', 'out.set(id, { ground: p.id, band: p.hunt.band[0] });', 'out.set(id, { ground: p.id, band: p.hunt.band[1] });'],
];

process.exitCode = await runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/imbue.mjs', pure, mutants: MUTANTS,
  green: 'the five rows, their slots and parts, life by quality, the fee under the ramp and the band all hold' });
