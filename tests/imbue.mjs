#!/usr/bin/env node
// mutant-rule-functions: pure
// ════════════════════════════════════════════════════════════════════════
// tests/imbue.mjs — IMBUEMENTS' ROWS, RULES AND SLICE, PROVEN IN NODE (lane/flame-temper-build, 2026-11-22; the worn set, its rows and
// the room rule by lane/tp-im-steps, 2026-11-26; 21-flame-temper-imbue-loot.md section 3, D-1, D-11, D-12; src/data/imbue-rules.js,
// src/core/imbue.js, src/core/power-ledger.js; the timer and the apply verb are 1063-flame-temper.sql's, run by its §7; one blow through
// the engine is tests/hunt-core/amount.mjs case imbue).
//
//   node tests/imbue.mjs            the rules
//   node tests/imbue.mjs --mutate   every planted defect must turn a rule RED
//
// ci-step: economy-selftests | Imbuement rows (one of each kind a slot, a part from another open ground, no family keys), life, the fee, the worn set and the consumable slice's room
// ci-run: node tests/imbue.mjs
// ci-run: node tools/mutant-gate.mjs node tests/imbue.mjs --mutate
//
// mutant-anchors: src/core/imbue.js src/data/imbue-rules.js src/core/power-ledger.js
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tests/_pure-guard.mjs planted)
//
//   IM-1  THE ROWS: the sample of five, Edge on the weapon, Ward on the body, Leech on the helmet; every part from an open ground other than
//         its best one (D-12); no family key, no in_fight, no flat row, no condition that matches nothing, no Trait's key; one stacking key
//         each (the data's validator, and planted rows it must refuse)
//   IM-2  LIFE: plain 20, fine 25, master 30 hunted hours (D-7); no quality, no life
//   IM-3  THE FEE: 0.4 h of wage at the piece's item Level x ramp(hero Level) (a Level 60 hero pays 30%), whole gold
//   IM-4  THE BAND is the part's home ground's entry Level; THE RECIPE is 5 of its part and 4 Remains at that band, 0.53 work-hours
//   IM-5  THE WORN SET: one a kind (the first stays), an unknown id, a spent one and a band no whole number dropped
//   IM-6  THE STEPS: 2 at or under the band, the contest curve past it, none past wearAhead under it
//   IM-7  THE SLICE (D-1, D-11): three worn at Level 200 fill the consumable cap of 6 between them, so a damage meal adds nothing on any
//         blow; one fires only on its channel and its condition; the cap ramps (Level 60: 1.8); a forged fourth row is clamped at the cap
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runPureGuard } from './_pure-guard.mjs';

const near = (a, b) => Math.abs(a - b) < 1e-9;

async function pure(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href + '?t=' + Date.now());
  const [D, C, wage, PL, TR, TT] = await Promise.all([imp('src/data/imbue-rules.js'), imp('src/core/imbue.js'), imp('src/data/wage.js'),
    imp('src/core/power-ledger.js'), imp('src/core/trades.js'), imp('src/data/traits.js')]);
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
  plant({ when: { metric: 'in_fight', eq: true } }, 'never in_fight');
  plant({ when: { metric: 'target_family', eq: 'undead' } }, 'family');
  plant({ when: null }, 'flat number');
  plant({ when: { metric: 'hit_element', eq: 'fire' } }, 'matches nothing');
  plant({ when: { metric: 'target_role', eq: 'giant' } }, 'matches nothing');
  plant({ best: { ground: 'pyre_field', seat: 'melee' } }, 'own best ground');
  plant({ part: 'coal_tongs' }, 'does not open');
  /* an imbuement never stacks with a Trait of its key: no imbuement key is a Trait's (held here, since the Traits are hidden data) */
  const traitKeys = new Set(Object.values(TT.TRAITS).map((t) => t.key));
  for (const [id, r] of Object.entries(D.IMBUE_RULES)) if (traitKeys.has(r.key)) out.push('IM-1 ' + id + ': key ' + r.key + ' is a Trait key');
  plant({ kind: 'charm' }, 'has no slot');
  /* IM-2 */
  const H = 3600000;
  if (C.lifeMs('plain') !== 20 * H || C.lifeMs('fine') !== 25 * H || C.lifeMs('master') !== 30 * H || C.lifeMs('epic') !== 0) out.push('IM-2 life is not 20 / 25 / 30 hunted hours');
  /* IM-3 */
  if (C.applyFee(120, 200) !== Math.ceil(0.4 * wage.wage(120))) out.push('IM-3 the fee at full ramp is ' + C.applyFee(120, 200) + ', want 0.4 h of ' + wage.wage(120));
  if (C.applyFee(60, 60) !== Math.ceil((400 * wage.wage(60) * 60) / 200000)) out.push('IM-3 a Level 60 hero does not pay 30% of the fee');
  if (C.applyFee(60, 0) !== 0 || C.applyFee(60, 999) !== C.applyFee(60, 200)) out.push('IM-3 the ramp is not held to 0..1');
  /* IM-4 */
  if (D.imbueBandOf('brute_edge') !== 70 || D.imbueBandOf('mana_leech') !== 55 || D.imbueBandOf('fire_ward') !== 45 || D.imbueBandOf('nope') !== null) out.push('IM-4 a band is not its part\'s home ground\'s entry Level');
  const rc = C.imbueRecipe('brute_edge');
  if (!rc || rc.item !== 'imbue_brute_edge' || rc.band !== 70 || JSON.stringify(rc.inputs) !== JSON.stringify({ pike_ferrule: 5 }) || rc.remains !== 4 || rc.workPm !== 530 || C.imbueRecipe('nope') !== null) out.push('IM-4 the Brute Edge recipe is ' + JSON.stringify(rc));
  /* IM-5 */
  const set = C.wornImbuesOf([{ id: 'brute_edge', band: 200, msLeft: 5 }, { id: 'fire_edge', band: 200, msLeft: 5 }, { id: 'fire_ward', band: 200, msLeft: 5 },
    { id: 'life_leech', band: 200, msLeft: 0 }, { id: 'mana_leech', band: 200, msLeft: 9 }, { id: 'nope', band: 200, msLeft: 9 }, { id: 'life_leech', band: 'x', msLeft: 9 }]);
  if (!set || set.map((w) => w.id).join() !== 'brute_edge,fire_ward,mana_leech') out.push('IM-5 the worn set is ' + JSON.stringify(set) + ': one a kind, the first, nothing spent or unknown');
  if (C.wornImbuesOf([]) !== null || C.wornImbuesOf(null) !== null) out.push('IM-5 an empty list is a worn set');
  /* IM-6 */
  if (!near(C.imbueStepsAt(70, 70), 2) || !near(C.imbueStepsAt(70, 60), 2)) out.push('IM-6 an imbuement at or over its hero is not 2 steps');
  if (Math.abs(C.imbueStepsAt(70, 160) - (2 * TR.behindPm(90)) / 1000) > 0.002 || !(C.imbueStepsAt(70, 160) < 2)) out.push('IM-6 a band 90 Levels behind is not the contest curve: ' + C.imbueStepsAt(70, 160));
  if (C.imbueStepsAt(85, 74) !== 0 || !(C.imbueStepsAt(85, 75) > 0)) out.push('IM-6 an imbuement more than wearAhead over its hero is worn');
  /* IM-7: rows through the one clamp */
  const knight = { role: 'brute', element: null }, ember = { role: null, element: 'ember' }, plain = { role: 'swarm', element: null };
  const food = (ch, s) => ({ slice: 'consumable', raises: ch, steps: s, key: 'food' });
  const off = (ctx, extra = [], L = 200) => PL.clampLedger(C.imbueRows(set, 'offense', ctx, L).concat(extra), L).offense;
  const def = (ctx, L = 200) => PL.clampLedger(C.imbueRows(set, 'defense', ctx, L), L).defense;
  if (!near(off(knight), 2) || !near(off(plain), 0)) out.push('IM-7 Brute Edge reads ' + off(knight) + ' on a brute and ' + off(plain) + ' on a swarm, want 2 and 0');
  if (!near(def(ember), 2) || !near(def(knight), 0)) out.push('IM-7 Fire Ward reads ' + def(ember) + ' on a Fire blow and ' + def(knight) + ' on a plain one, want 2 and 0');
  if (!near(off(knight, [food('offense', 6)]), 2) || !near(off(plain, [food('offense', 6)]), 0)) out.push('IM-7 a damage meal on top of three imbuements adds ' + (off(knight, [food('offense', 6)]) - 2) + ': the room rule (D-11) is gone');
  if (!near(PL.clampLedger([food('offense', 6)], 200).offense, 6) || !near(PL.clampLedger([food('offense', 9)], 200).offense, 6)) out.push('IM-7 a meal alone does not fill the slice to its cap of 6');
  const two = C.wornImbuesOf([{ id: 'brute_edge', band: 200, msLeft: 5 }]);
  if (!near(PL.clampLedger(C.imbueRows(two, 'offense', plain, 200).concat([food('offense', 6)]), 200).offense, 4)) out.push('IM-7 one waiting Edge does not leave a meal 4 of the 6');
  const at60 = C.wornImbuesOf([{ id: 'brute_edge', band: 60, msLeft: 5 }, { id: 'fire_ward', band: 60, msLeft: 5 }, { id: 'mana_leech', band: 60, msLeft: 5 }]);
  const off60 = PL.clampLedger(C.imbueRows(at60, 'offense', knight, 60).concat([food('offense', 6)]), 60).offense;
  if (!near(off60, 0.6) || !near(PL.sliceCap('consumable', 60), 1.8)) out.push('IM-7 at Level 60 the Edge with a meal reads ' + off60 + ' and the cap ' + PL.sliceCap('consumable', 60) + ', want 0.6 and 1.8 (ramp)');
  const forged = ['a', 'b', 'c', 'd'].map((k) => ({ slice: 'consumable', raises: 'offense', steps: 2, key: 'edge_' + k }));
  if (!near(PL.clampLedger(forged, 200).offense, 6)) out.push('IM-7 four forged imbuement rows read ' + PL.clampLedger(forged, 200).offense + ', past the cap of 6');
  return out;
}

const MUTANTS = [
  ['in_fight passes as a condition', 'src/data/imbue-rules.js', "if (r.when && r.when.metric === 'in_fight')", 'if (false)'],
  ['a part from its own best ground passes', 'src/data/imbue-rules.js', 'else if (home.ground === r.best.ground)', 'else if (false)'],
  ['a staged ground\'s part passes', 'src/data/imbue-rules.js', "else if (!home.open || !OPEN_GROUNDS.has(r.best.ground))", 'else if (false)'],
  ['a condition that matches nothing passes', 'src/data/imbue-rules.js', '!(own(METRICS, r.when.metric) && METRICS[r.when.metric](r.when.eq))', 'false'],
  ['an imbuement takes a Trait key', 'src/data/imbue-rules.js', "key: 'edge_brute',", "key: 'boss',"],
  ['a flat row passes', 'src/data/imbue-rules.js', 'if (!r.when && !r.convert && !r.leech)', 'if (false)'],
  ['quality sets no life', 'src/core/imbue.js', '(1000 + IMBUE.lifeRungPm * rung)', '(1000)'],
  ['the fee ignores the ramp', 'src/core/imbue.js', 'const L = Math.max(0, Math.min(POWER_LEDGER.rampLevel, Math.floor(Number(heroLevel) || 0)));', 'const L = POWER_LEDGER.rampLevel;'],
  ['the band is the best ground\'s', 'src/data/imbue-rules.js', 'out.set(id, { ground: p.id, band: p.hunt.band[0], open:', 'out.set(id, { ground: p.id, band: p.hunt.band[1], open:'],
  ['a second of one kind is worn', 'src/core/imbue.js', 'if (!byKind.has(kind)) byKind.set(kind,', 'byKind.set(kind + byKind.size,'],
  ['a spent imbuement is worn', 'src/core/imbue.js', "if (!own(IMBUE_RULES, id) || !whole(x.band) || !whole(x.msLeft)) continue;", "if (!own(IMBUE_RULES, id) || !whole(x.band)) continue;"],
  ['no contest curve behind the band', 'src/core/imbue.js', 'return IMBUE.steps / powSquare(1 + DANGER.powerStep, Math.max(0, L - b));', 'return IMBUE.steps;'],
  ['a band past wearAhead is worn', 'src/core/imbue.js', 'if (!b || !L || b > L + GEAR_STEPS.wearAhead) return 0;', 'if (!b || !L) return 0;'],
  ['an imbuement fires on any monster', 'src/core/imbue.js', 'const fires = r.raises === channel && holdsOn(r, ctx);', 'const fires = r.raises === channel;'],
  ['a waiting imbuement takes no room', 'src/core/power-ledger.js', 'if (!ch.mine.has(key) || ch.mine.get(key)[0] <= 0) room += g;', 'if (false) room += g;'],
  ['the consumable slice has no cap', 'src/core/power-ledger.js', 'Math.max(0, Math.min(cap, gains + room) - room)', 'Math.max(0, gains)'],
];

process.exitCode = await runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/imbue.mjs', pure, mutants: MUTANTS,
  green: 'the five rows on open grounds, life, the fee, the recipe, the worn set, the band\'s steps and the slice\'s room all hold' });
