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
// mutant-anchors: src/core/imbue.js src/data/imbue-rules.js src/core/power-ledger.js src/core/hunt-spawn.js src/data/power-ledger.js src/core/hunt/imbue-leech.js
// mutant-writes-tree: no — every mutant is planted into a temp copy of src (tests/_pure-guard.mjs planted)
//
//   IM-1  THE ROWS: the sample of five, Edge on the weapon, Ward on the body, Leech on the helmet; every part from an open ground other than
//         its best one (D-12); no family key, no in_fight, no flat row, no condition that matches nothing, no Trait's key; one stacking key
//         each (the data's validator, and planted rows it must refuse)
//   IM-2  LIFE: plain 20, fine 25, master 30 hunted hours (D-7); no quality, no life
//   IM-3  THE FEE AT THE BAND (21 D-19): 0.4 h of wage at the imbuement's band, no ramp, whole gold: 6,813 for a band 70 Edge whatever
//         the piece it goes on or the hero's Level (hr_imbue_fee's pins are 1069's VERIFY(n); the verb's are 1078's §5 and worn-imbues-db WI-6)
//   IM-4  THE BAND is the part's home ground's entry Level; THE RECIPE is 5 of its part and 4 Remains at that band, 0.53 work-hours
//   IM-5  THE WORN SET: one a kind (the first stays), an unknown id, a spent one and a band no whole number dropped
//   IM-6  THE STEPS: 2 at or under the band, the contest curve past it, none past wearAhead under it
//   IM-7  THE SLICE (D-1, D-11): three worn at Level 200 fill the consumable cap of 6 between them, so a damage meal adds nothing on any
//         blow; one fires only on its channel and its condition; the cap and the rows are whole at every Level (21 D-16, lane/designer-
//         imbue-calls: a Level 60 Edge reads 2 of a cap of 6, not 0.6 of 1.8); a forged fourth row is clamped at the cap; a conditional
//         row carries its fire size, a whole number from 2 to fireMax (D-17), and a rule row none
//   IM-8  THE RUN-OUT (1077-worn-imbues.sql, lane/worn-imbues): heroSetup turns the server's msLeft into the instant it runs out (the read's
//         settled_to plus msLeft) and carries no msLeft on; the engine's re-read at every boundary keeps that set whole (before this lane
//         it dropped every imbuement heroSetup handed it: no msLeft survived); imbuesAt stands one to the millisecond before its instant
//         and drops it at that instant; a Lab hero with no read instant lasts the span
//   IM-9  THE FIRE SIZE (21 D-17, lane/imbue-engine): a firing Brute Edge writes its fire size 5 x c over its rated room 2 x c, a waiting
//         one its room alone; with a meal of 6 a Level 60 brute's blow reads 5 plus what the three rated rooms leave (0.14) and a swarm's
//         only that; Fire Ward 11 x c on an ember blow; rooms past the cap (a forged fourth) scale the firing rows to the cap's share. A
//         conversion (Fire Edge) writes its whole steps x c, a gain and a cost alike (D-21), and on a blow it does not change it waits on
//         its room (D-22): a meal beside it on a neutral target gets only what the three rooms leave (lane/imbue-d21-d22)
//   IM-10 THE LEECH (21 D-18, lane/imbue-engine): floor((took x pm + carry) / 1000) a blow, the remainder carried (a 30 HP blow at 20
//         pays 0, 1, 0, 1, 1); pm is leech.pm x c at its band, whole, at least 1 (D-21, lane/imbue-d21-d22: a band 50 Life Leech 20 at
//         Level 50, 19 at 60, 17 at 97, 12 at 200), on the rule and on a hero through the fight's door (src/core/hunt/imbue-leech.js):
//         never past max HP or mana, nothing off a blow at an ally or from a Leech past wearAhead under its band (the heal cut:
//         tests/hunt-core/necrotic-storm.mjs withered-cuts, with Withered planted live)
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runPureGuard } from './_pure-guard.mjs';
import { harnessFail } from './_mutant-verdict.mjs';

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
  /* D-17: a conditional row fires at its measured size, whole, from its rated 2 to fireMax; a rule row has none */
  plant({ fire: null }, 'fires at'); plant({ fire: 1 }, 'fires at'); plant({ fire: 21 }, 'fires at'); plant({ fire: 4.5 }, 'fires at');
  if (!D.validateImbues({ ...D.IMBUE_RULES, fire_edge: { ...D.IMBUE_RULES.fire_edge, fire: 3 } }).some((p) => p.includes('no fire size'))) out.push('IM-1 a rule row with a fire size was not refused');
  /* a conversion takes no condition (imbueRows: it writes its steps or waits, D-22, never fires) */
  if (!D.validateImbues({ ...D.IMBUE_RULES, fire_edge: { ...D.IMBUE_RULES.fire_edge, when: { metric: 'target_role', eq: 'brute' }, fire: 5 } }).some((p) => p.includes('takes no condition'))) out.push('IM-1 a conversion with a condition was not refused');
  if (D.IMBUE_RULES.brute_edge.fire !== 5 || D.IMBUE_RULES.fire_ward.fire !== 11 || D.IMBUE_RULES.life_leech.leech.pm !== 20) out.push('IM-1 the measured sizes moved (21 section 11): Brute Edge ' + D.IMBUE_RULES.brute_edge.fire + ', Fire Ward ' + D.IMBUE_RULES.fire_ward.fire + ', Life Leech ' + D.IMBUE_RULES.life_leech.leech.pm);
  plant({ best: { ground: 'pyre_field', seat: 'melee' } }, 'own best ground');
  plant({ part: 'coal_tongs' }, 'does not open');
  /* an imbuement never stacks with a Trait of its key: no imbuement key is a Trait's (held here, since the Traits are hidden data) */
  const traitKeys = new Set(Object.values(TT.TRAITS).map((t) => t.key));
  for (const [id, r] of Object.entries(D.IMBUE_RULES)) if (traitKeys.has(r.key)) out.push('IM-1 ' + id + ': key ' + r.key + ' is a Trait key');
  plant({ kind: 'charm' }, 'has no slot');
  /* IM-2 */
  const H = 3600000;
  if (C.lifeMs('plain') !== 20 * H || C.lifeMs('fine') !== 25 * H || C.lifeMs('master') !== 30 * H || C.lifeMs('epic') !== 0) out.push('IM-2 life is not 20 / 25 / 30 hunted hours');
  /* IM-3 THE FEE AT THE BAND (21 D-19, lane/imbue-fee-timer): 0.4 h of wage at the imbuement's band, no ramp, whatever the piece or the
     hero. A second argument (an item Level, a hero Level, as the fee read before) moves nothing */
  if (C.applyFee(70) !== 6813) out.push('IM-3 a band 70 imbuement costs ' + C.applyFee(70) + ', want 6,813 (0.4 h of wage(70) ' + wage.wage(70) + ')');
  if (C.applyFee(D.imbueBandOf('brute_edge')) !== 6813) out.push('IM-3 Brute Edge (band ' + D.imbueBandOf('brute_edge') + ') costs ' + C.applyFee(D.imbueBandOf('brute_edge')));
  for (const other of [1, 20, 60, 120, 200, 400]) {
    if (C.applyFee(70, other) !== 6813) out.push('IM-3 the band 70 fee reads its second argument ' + other + ': ' + C.applyFee(70, other));
  }
  if (C.applyFee(120) !== Math.ceil(0.4 * wage.wage(120)) || C.applyFee(45) !== Math.ceil(0.4 * wage.wage(45))) out.push('IM-3 the fee is not 0.4 h of wage at its band');
  if (C.applyFee(0) !== C.applyFee(1) || C.applyFee('x') !== C.applyFee(1) || C.applyFee(70.9) !== 6813) out.push('IM-3 a band that is no whole number is not held to a whole band of 1 or more');
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
  /* (each at its band: it fires at its fire size, 5 and 11, D-17; IM-9 holds the rule) */
  if (!near(off(knight), 5) || !near(off(plain), 0)) out.push('IM-7 Brute Edge reads ' + off(knight) + ' on a brute and ' + off(plain) + ' on a swarm, want 5 and 0');
  if (!near(def(ember), 11) || !near(def(knight), 0)) out.push('IM-7 Fire Ward reads ' + def(ember) + ' on a Fire blow and ' + def(knight) + ' on a plain one, want 11 and 0');
  if (!near(off(knight, [food('offense', 6)]), 5) || !near(off(plain, [food('offense', 6)]), 0)) out.push('IM-7 a damage meal on top of three imbuements adds ' + (off(knight, [food('offense', 6)]) - 5) + ': the room rule (D-11) is gone');
  if (!near(PL.clampLedger([food('offense', 6)], 200).offense, 6) || !near(PL.clampLedger([food('offense', 9)], 200).offense, 6)) out.push('IM-7 a meal alone does not fill the slice to its cap of 6');
  const two = C.wornImbuesOf([{ id: 'brute_edge', band: 200, msLeft: 5 }]);
  if (!near(PL.clampLedger(C.imbueRows(two, 'offense', plain, 200).concat([food('offense', 6)]), 200).offense, 4)) out.push('IM-7 one waiting Edge does not leave a meal 4 of the 6');
  const at60 = C.wornImbuesOf([{ id: 'brute_edge', band: 60, msLeft: 5 }, { id: 'fire_ward', band: 60, msLeft: 5 }, { id: 'mana_leech', band: 60, msLeft: 5 }]);
  const off60 = PL.clampLedger(C.imbueRows(at60, 'offense', knight, 60).concat([food('offense', 6)]), 60).offense;
  if (!near(off60, 5) || !near(PL.sliceCap('consumable', 60), 6) || !near(PL.sliceCap('consumable', 10), 6)) out.push('IM-7 at Level 60 the Edge with a meal reads ' + off60 + ' and the cap ' + PL.sliceCap('consumable', 60) + ', want 5 and 6: the slice is whole at every Level (21 D-16)');
  const forged = ['a', 'b', 'c', 'd'].map((k) => ({ slice: 'consumable', raises: 'offense', steps: 2, key: 'edge_' + k }));
  if (!near(PL.clampLedger(forged, 200).offense, 6)) out.push('IM-7 four forged imbuement rows read ' + PL.clampLedger(forged, 200).offense + ', past the cap of 6');
  /* IM-8: the run-out instant, through the settle's own door (heroSetup, then syncUnit's re-read at every boundary) */
  const T0 = 1764000000000;
  const read = [{ id: 'brute_edge', band: 70, msLeft: 5000 }, { id: 'fire_ward', band: 45, msLeft: 90000 }];
  const want = JSON.stringify([{ id: 'brute_edge', band: 70, kind: 'edge', untilMs: T0 + 5000 }, { id: 'fire_ward', band: 45, kind: 'ward', untilMs: T0 + 90000 }]);
  const worn = C.wornImbuesOf(read, T0);
  if (JSON.stringify(worn) !== want) out.push('IM-8 the worn set is ' + JSON.stringify(worn) + ': want each one to the read\'s settled_to plus its msLeft, and no msLeft carried on (a peer\'s frozen key)');
  /* ...and heroSetup (the settle's door, hunt-settle.js) hands exactly that set (loaded here alone: it reads the whole catalogue) */
  let SP = null;
  try { SP = await imp('src/core/hunt-spawn.js'); } catch (e) { out.push(harnessFail('IM-8 loading the hero builder', e)); }
  const hero = SP ? SP.heroSetup({ weaponType: 'sword', options: {}, bar: [], wornImbues: read, readAtMs: T0 }) : null;
  if (SP && JSON.stringify(hero && hero.wornImbues) !== want) out.push('IM-8 heroSetup hands the fight ' + JSON.stringify(hero && hero.wornImbues) + ', want ' + want);
  /* the engine re-reads its own set at every boundary (combat-sim.js syncUnit): the set heroSetup made must survive it whole */
  if (JSON.stringify(C.wornImbuesOf(worn)) !== JSON.stringify(worn)) out.push('IM-8 the set heroSetup made does not survive the engine\'s re-read: ' + JSON.stringify(C.wornImbuesOf(worn)));
  const idsOf = (s) => (s ? s.map((w) => w.id).join() : 'none');
  if (idsOf(C.imbuesAt(worn, T0)) !== 'brute_edge,fire_ward' || idsOf(C.imbuesAt(worn, T0 + 4999)) !== 'brute_edge,fire_ward') out.push('IM-8 an imbuement with time left does not stand: ' + idsOf(C.imbuesAt(worn, T0 + 4999)));
  if (idsOf(C.imbuesAt(worn, T0 + 5000)) !== 'fire_ward' || idsOf(C.imbuesAt(worn, T0 + 90000)) !== 'none') out.push('IM-8 an imbuement stands at or past its run-out: ' + idsOf(C.imbuesAt(worn, T0 + 5000)) + ' / ' + idsOf(C.imbuesAt(worn, T0 + 90000)));
  /* a Lab hero (no read instant) lasts the span; a raw list re-read at a boundary keeps its rules */
  const lab = C.wornImbuesOf(read);
  if (!lab || lab.some((w) => w.untilMs !== null) || idsOf(C.imbuesAt(lab, T0 + 1e9)) !== 'brute_edge,fire_ward') out.push('IM-8 a hero with no read instant does not last the span: ' + JSON.stringify(lab));
  if (idsOf(C.imbuesAt([{ id: 'life_leech', band: 45, msLeft: 0 }, { id: 'nope', band: 45, msLeft: 9 }], T0)) !== 'none') out.push('IM-8 imbuesAt wears a spent or unknown imbuement');
  /* IM-9 THE FIRE SIZE OVER THE RATED ROOM (21 D-17, lane/imbue-engine): a Level 60 hero in its real three (Brute Edge band 70, Fire Ward
     45, Mana Leech 55). On a brute the Edge's row fires at 5 x c (c = 1 at or under its band) over a room of 2; on a swarm it waits on its
     room of 2 and fires nothing. With a meal of 6 the meal gets only what the three rooms leave (6 - 2 - 1.90 - 1.97 = 0.14), on a brute
     and a swarm alike, so the brute's blow reads 5 + 0.14. Fire Ward on an ember blow 11 x its curve; past its band the Edge fires at
     5 x its curve; rooms past the cap (a forged fourth) scale every firing row to the cap's share. */
  const real = C.wornImbuesOf([{ id: 'brute_edge', band: 70, msLeft: 5 }, { id: 'fire_ward', band: 45, msLeft: 5 }, { id: 'mana_leech', band: 55, msLeft: 5 }]);
  const rowOf = (ctx, ch, L) => C.imbueRows(real, ch, ctx, L).find((r) => r.key === 'edge_brute');
  const fr = rowOf(knight, 'offense', 60), wr = rowOf(plain, 'offense', 60);
  if (!fr || !near(fr.steps, 5) || !near(fr.room, 2) || fr.holds === false) out.push('IM-9 a firing Brute Edge at Level 60 writes ' + JSON.stringify(fr) + ', want 5 steps over a room of 2');
  if (!wr || !near(wr.steps, 2) || wr.holds !== false || wr.room !== undefined) out.push('IM-9 a waiting Brute Edge writes ' + JSON.stringify(wr) + ', want its rated 2 as room');
  const leftover = 6 - C.imbueStepsAt(70, 60) - C.imbueStepsAt(45, 60) - C.imbueStepsAt(55, 60);
  const realOff = (ctx) => PL.clampLedger(C.imbueRows(real, 'offense', ctx, 60).concat([food('offense', 6)]), 60).offense;
  if (!(leftover > 0.1 && leftover < 0.2) || !near(realOff(knight), 5 + leftover) || !near(realOff(plain), leftover)) out.push('IM-9 with a meal of 6 a brute\'s blow reads ' + realOff(knight) + ' and a swarm\'s ' + realOff(plain) + ', want 5 + ' + leftover + ' and ' + leftover + ' (the fire size over the rated rooms)');
  const wardC = C.imbueStepsAt(45, 60) / 2, defReal = PL.clampLedger(C.imbueRows(real, 'defense', ember, 60), 60).defense;
  if (!(wardC < 1) || !near(defReal, 11 * wardC)) out.push('IM-9 Fire Ward on an ember blow at Level 60 reads ' + defReal + ', want 11 x ' + wardC);
  const past = rowOf(knight, 'offense', 160), pastC = C.imbueStepsAt(70, 160) / 2;
  if (!past || !(pastC < 1) || !near(past.steps, 5 * pastC) || !near(past.room, 2 * pastC)) out.push('IM-9 a Brute Edge 90 Levels behind fires ' + JSON.stringify(past) + ', want 5 and a room of 2, each x ' + pastC);
  const four = ['a', 'b', 'c', 'd'].map((k) => ({ slice: 'consumable', raises: 'offense', steps: 5, room: 2, key: 'edge_' + k }));
  if (!near(PL.clampLedger(four, 200).offense, 15)) out.push('IM-9 four forged firing rows (rooms 8 of a cap of 6) read ' + PL.clampLedger(four, 200).offense + ', want 20 x 6 / 8 = 15');
  /* THE CONVERSION ON THE CURVE (21 D-21, lane/imbue-d21-d22): a Fire Edge (band 70) 90 Levels past its band writes its whole steps x c,
     a gain (an Undead's +2, amount.js stepsOf) and a cost (a stone golem's -4) alike, no room. ITS WAITING ROW (D-22, D-11): on a blow it
     does not change (n 0: a target neutral to Fire, or a Fire blow) it waits on its rated 2 x c, so beside a Fire Ward and a Mana Leech
     at Level 60 a meal of 6 gets only what the three rooms leave (0.14, as the Brute Edge case reads), not the 2.14 two rooms leave */
  const fireSet = C.wornImbuesOf([{ id: 'fire_edge', band: 70, msLeft: 5 }, { id: 'fire_ward', band: 45, msLeft: 5 }, { id: 'mana_leech', band: 55, msLeft: 5 }]);
  const convRow = (n, L) => C.imbueRows(fireSet, 'offense', { role: null, element: null, convert: () => n }, L).find((r) => r.key === 'edge_fire');
  const fireC = C.imbueStepsAt(70, 160) / 2;
  for (const n of [2, -4]) {
    const cr = convRow(n, 160);
    if (!(fireC < 1) || !cr || !near(cr.steps, n * fireC) || cr.holds === false || cr.room !== undefined) out.push('IM-9 a Fire Edge 90 Levels past its band converting ' + n + ' writes ' + JSON.stringify(cr) + ', want ' + n + ' x ' + fireC + ' and no room (D-21)');
  }
  const idle = convRow(0, 160);
  if (!idle || !near(idle.steps, 2 * fireC) || idle.holds !== false || idle.room !== undefined) out.push('IM-9 a Fire Edge on a blow it does not change writes ' + JSON.stringify(idle) + ', want its waiting row of 2 x ' + fireC + ' (D-22)');
  const neutral = PL.clampLedger(C.imbueRows(fireSet, 'offense', { role: null, element: null, convert: () => 0 }, 60).concat([food('offense', 6)]), 60).offense;
  if (!near(neutral, leftover)) out.push('IM-9 a meal of 6 beside a Fire Edge, a Fire Ward and a Mana Leech on a neutral target reads ' + neutral + ', want what the three rooms leave, ' + leftover + ' (D-22)');
  /* IM-10 THE LEECH (21 D-18, lane/imbue-engine): floor((took x pm + carry) / 1000) a blow, the remainder carried. At 20 permille a 30 HP
     blow pays 0, 1, 0, 1, 1 over five (600 thousandths each) on the pure rule. THE CURVE (21 D-21, lane/imbue-d21-d22): pm is leech.pm x c
     at its band, rounded whole, at least 1: a band 50 Life Leech heals 20 at Level 50, 19 at 60, 17 at 97, 12 at 200 (1 at the very least),
     so the Level 60 hero through the fight's own door (imbue-leech.js leechOn) pays 0, 1, 0, 1, 0 (570 each). HP never past max (the
     carry still moves), a Mana Leech's mana never past max, nothing at an ally, and nothing past wearAhead under its band */
  const band50 = C.wornImbuesOf([{ id: 'life_leech', band: 50, msLeft: 5 }]);
  const pmAt = (L) => { const l = C.leechOf(band50, L); return l ? l.pm : null; };
  if ([50, 60, 97, 200, 1600].map(pmAt).join() !== '20,19,17,12,1') out.push('IM-10 a band 50 Life Leech heals ' + [50, 60, 97, 200, 1600].map(pmAt).join() + ' permille at Levels 50, 60, 97, 200 and 1,600, want 20,19,17,12,1 (leech.pm x c, rounded whole, at least 1: D-21)');
  let carry = 0;
  const pays = [];
  for (let i = 0; i < 5; i++) { const p = C.leechPay(30, 20, carry); pays.push(p.back + '/' + p.carry); carry = p.carry; }
  if (pays.join() !== '0/600,1/200,0/800,1/400,1/0') out.push('IM-10 five 30 HP blows at 20 permille pay ' + pays.join() + ', want 0/600,1/200,0/800,1/400,1/0');
  if (C.leechPay(1234, 20, 999).back !== Math.floor((1234 * 20 + 999) / 1000) || C.leechPay(1234, 20, 999).carry !== (1234 * 20 + 999) % 1000) out.push('IM-10 a 1,234 HP blow on 999 carried pays ' + JSON.stringify(C.leechPay(1234, 20, 999)));
  let LE = null;
  try { LE = await imp('src/core/hunt/imbue-leech.js'); } catch (e) { out.push(harnessFail('IM-10 loading the fight\'s leech', e)); }
  if (LE) {
    const life = C.wornImbuesOf([{ id: 'life_leech', band: 50, msLeft: 5 }]);
    const foe = { side: 'mon', id: 9, alive: true };
    const h = { side: 'hero', id: 1, alive: true, heroLv: 60, hp: 50, maxHp: 100, mana: 0, maxMana: 0, leechMilli: 0, imbues: life };
    const got = [];
    for (let i = 0; i < 5; i++) { const r = LE.leechOn(h, foe, 30); got.push((r ? r.hp : 0) + '/' + h.leechMilli); }
    if (got.join() !== '0/570,1/140,0/710,1/280,0/850' || h.hp !== 52) out.push('IM-10 a Level 60 Life Leech hero (band 50, 19 permille) healed ' + got.join() + ' over five 30 HP blows (HP ' + h.hp + '), want 0/570,1/140,0/710,1/280,0/850 and 52');
    const full = { ...h, hp: 100, leechMilli: 900 };
    if (LE.leechOn(full, foe, 30) !== null || full.hp !== 100 || full.leechMilli !== 470) out.push('IM-10 a hero at full HP healed past max or lost its carry (HP ' + full.hp + ', carry ' + full.leechMilli + ', want 470)');
    /* a Level 200 hero's band 50 Leech pays 12 permille through the same door: a 1,000 HP blow heals 12 */
    const old = { ...h, heroLv: 200, hp: 10, leechMilli: 0 };
    const or = LE.leechOn(old, foe, 1000);
    if (!or || or.hp !== 12 || old.hp !== 22 || old.leechMilli !== 0) out.push('IM-10 a Level 200 hero\'s band 50 Life Leech on a 1,000 HP blow healed ' + JSON.stringify(or) + ' (HP ' + old.hp + '), want 12 (D-21)');
    const mage = { side: 'hero', id: 2, alive: true, heroLv: 60, hp: 10, maxHp: 100, mana: 95, maxMana: 100, leechMilli: 0, imbues: C.wornImbuesOf([{ id: 'mana_leech', band: 55, msLeft: 5 }]) };
    const mr = LE.leechOn(mage, foe, 1000);
    if (!mr || mr.mana !== 5 || mr.hp !== 0 || mage.mana !== 100 || mage.hp !== 10) out.push('IM-10 a Mana Leech on a 1,000 HP blow at 95 of 100 mana gave ' + JSON.stringify(mr) + ' (mana ' + mage.mana + ', HP ' + mage.hp + '), want 5 mana to its max and no HP');
    const ally = { side: 'hero', id: 3, alive: true };
    if (LE.leechOn({ ...h }, ally, 3000) !== null) out.push('IM-10 a Leech paid back off a blow at an ally');
    const ahead = { ...h, heroLv: 30, leechMilli: 0 };
    if (LE.leechOn(ahead, foe, 3000) !== null || ahead.leechMilli !== 0) out.push('IM-10 a Level 30 hero (band 50, more than wearAhead under it) leeched');
  }
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
  ['the fee reads the worn piece\'s item Level', 'src/core/imbue.js', 'export function applyFee(band) {', 'export function applyFee(band, itemLevel) { if (itemLevel) band = itemLevel;'],
  ['the fee ramps by the hero\'s Level again', 'src/core/imbue.js', 'return wagePrice(IMBUE.feeHoursPm, Math.max(1, Math.floor(Number(band) || 1)));',
    'return Math.ceil(wagePrice(IMBUE.feeHoursPm, Math.max(1, Math.floor(Number(band) || 1))) * 60 / 200);'],
  ['the band is the best ground\'s', 'src/data/imbue-rules.js', 'out.set(id, { ground: p.id, band: p.hunt.band[0], open:', 'out.set(id, { ground: p.id, band: p.hunt.band[1], open:'],
  ['a second of one kind is worn', 'src/core/imbue.js', 'if (!byKind.has(kind)) byKind.set(kind,', 'byKind.set(kind + byKind.size,'],
  ['a spent imbuement is worn', 'src/core/imbue.js', ': whole(x.msLeft) ? (from === null', ': true ? (from === null'],
  ['the run-out instant is the read\'s own', 'src/core/imbue.js', '(from === null ? null : from + whole(x.msLeft))', '(from === null ? null : from)'],
  ['an imbuement never runs out in the fight', 'src/core/imbue.js', '(from === null ? null : from + whole(x.msLeft))', '(null)'],
  ['the engine\'s own set does not survive a re-read', 'src/core/imbue.js', "own(x, 'untilMs') ? (Number.isSafeInteger(x.untilMs) ? x.untilMs : null)", 'false ? (null)'],
  ['msLeft rides on into the hero', 'src/core/imbue.js', 'kind, untilMs }));', 'kind, untilMs, msLeft: x.msLeft }));'],
  ['a run-out imbuement still stands', 'src/core/imbue.js', 'w.untilMs === null || w.untilMs > atMs', 'true'],
  ['a run-out lands one boundary late', 'src/core/imbue.js', 'w.untilMs === null || w.untilMs > atMs', 'w.untilMs === null || w.untilMs >= atMs'],
  ['heroSetup never reads the read\'s instant', 'src/core/hunt-spawn.js', 'wornImbuesOf(o.wornImbues, o.readAtMs)', 'wornImbuesOf(o.wornImbues)'],
  ['no contest curve behind the band', 'src/core/imbue.js', 'return IMBUE.steps / powSquare(1 + DANGER.powerStep, Math.max(0, L - b));', 'return IMBUE.steps;'],
  ['a band past wearAhead is worn', 'src/core/imbue.js', 'if (!b || !L || b > L + GEAR_STEPS.wearAhead) return 0;', 'if (!b || !L) return 0;'],
  ['an imbuement fires on any monster', 'src/core/imbue.js', 'else if (on && holdsOn(r, ctx)) {', 'else if (on) {'],
  ['a waiting imbuement takes no room', 'src/core/power-ledger.js', 'if (ch.fire.has(key) || !ch.mine.has(key) || ch.mine.get(key)[0] <= 0) room += g;', 'if (false) room += g;'],
  /* IM-9 (D-17) */
  ['a firing row fires its rated 2', 'src/core/imbue.js', 'const fire = Number.isInteger(r.fire) ? r.fire : IMBUE.steps;', 'const fire = IMBUE.steps;'],
  ['the fire size skips the contest curve', 'src/core/imbue.js', 'steps: (steps * fire) / IMBUE.steps, room: steps,', 'steps: fire, room: steps,'],
  ['a firing row reserves no room', 'src/core/power-ledger.js', '      ch.room.set(key, Math.max(ch.room.get(key) || 0, r.room));\n', ''],
  ['a firing row counts inside the cap', 'src/core/power-ledger.js', 'if (gainsOnly && r.steps > 0 && Number.isFinite(r.room) && r.room > 0) {', 'if (false) {'],
  ['a forged fourth fires past the cap', 'src/core/power-ledger.js', 'const scale = room > cap ? cap / room : 1;', 'const scale = 1;'],
  /* IM-10 (D-18) */
  ['the leech carries nothing', 'src/core/imbue.js', 'return { back: Math.floor(milli / 1000), carry: milli % 1000 };', 'return { back: Math.floor(milli / 1000), carry: 0 };'],
  ['the leech forgets the carry it held', 'src/core/hunt/imbue-leech.js', 'const pay = leechPay(took, l.pm, u.leechMilli);', 'const pay = leechPay(took, l.pm, 0);'],
  ['the leech heals past max HP', 'src/core/hunt/imbue-leech.js', 'Math.min(healTaken(u, pay.back), int(u.maxHp) - int(u.hp))', 'healTaken(u, pay.back)'],
  ['a Mana Leech fills past max mana', 'src/core/hunt/imbue-leech.js', 'Math.min(pay.back, int(u.maxMana) - int(u.mana))', 'pay.back'],
  ['a Mana Leech heals HP', 'src/core/hunt/imbue-leech.js', "if (l.of === 'mana') {", "if (false) {"],
  ['the leech pays off a blow at an ally', 'src/core/hunt/imbue-leech.js', ' || !t || !isEnemy(u, t)) return null;', ') return null;'],
  ['a leech past wearAhead plays', 'src/core/imbue.js', '    if (steps) return { id: w.id, of: r.leech.of,', '    if (pm) return { id: w.id, of: r.leech.of,'],
  /* IM-9 and IM-10 (lane/imbue-d21-d22: 21 D-21, D-22) */
  ['the leech skips the contest curve', 'src/core/imbue.js', 'pm: Math.round((pm * steps) / IMBUE.steps) || 1 };', 'pm: pm };'],
  ['the leech rounds down', 'src/core/imbue.js', 'pm: Math.round((pm * steps) / IMBUE.steps) || 1 };', 'pm: Math.floor((pm * steps) / IMBUE.steps) || 1 };'],
  ['the leech can round to nothing', 'src/core/imbue.js', 'pm: Math.round((pm * steps) / IMBUE.steps) || 1 };', 'pm: Math.round((pm * steps) / IMBUE.steps) };'],
  ['a conversion skips the contest curve', 'src/core/imbue.js', 'raises: channel, steps: (steps * n) / IMBUE.steps, key: r.key });', 'raises: channel, steps: n, key: r.key });'],
  /* (the rule as it stood: a priced conversion that converts nothing writes no row) */
  ['a conversion that changes nothing takes no room', 'src/core/imbue.js', '    else if (on && holdsOn(r, ctx)) {',
    "    else if (on && r.convert && ctx && typeof ctx.convert === 'function') continue;\n    else if (on && holdsOn(r, ctx)) {"],
  ['a conversion row with a condition passes', 'src/data/imbue-rules.js', 'if (r.convert && r.when)', 'if (false)'],
  ['the consumable slice has no cap', 'src/core/power-ledger.js', 'Math.max(0, Math.min(cap, gains + room) - room)', 'Math.max(0, gains)'],
  ['the consumable slice ramps again', 'src/data/power-ledger.js', 'max: POWER_LEDGER.consumableStepsMax, ramps: false,', 'max: POWER_LEDGER.consumableStepsMax, ramps: true,'],
  ['a conditional row with no fire size passes', 'src/data/imbue-rules.js', 'if (r.when && !(Number.isInteger(r.fire)', 'if (false && !(Number.isInteger(r.fire)'],
  ['a fire size past one tier passes', 'src/data/imbue-rules.js', 'r.fire <= IMBUE.fireMax)', 'r.fire <= 999)'],
];

process.exitCode = await runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/imbue.mjs', pure, mutants: MUTANTS,
  green: 'the five rows on open grounds, life, the fee, the recipe, the worn set, the band\'s steps, the slice\'s room and the run-out instant all hold' });
