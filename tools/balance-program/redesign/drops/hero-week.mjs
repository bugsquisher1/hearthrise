#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/drops/hero-week.mjs — A HERO'S WEEK OF TRAIT PIECES, ON THE REAL ROLLER (designer, lane/designer-pity,
// 2026-11-26; 12-targets.md 8.6, the pity and base ruling).
//
// Each sample is ONE hero of a seat (hammer, bow, mage, healer) wearing the ground's own bases of its kind, at every kill of its party
// (refKillsHead x n an hour) at the reference company's held step, rolling src/core/trait-roll.js rollKillFor on its own seeded stream.
// Kills an hour are the ground's measured reference, so this reads the roller and the hours together, not the engine's pace.
//   week     pieces in a hero-week (70 hunted hours: the 10 h day x 7) at the 10th, 50th and 90th percentile, and how many are a base the
//            hero can wear (its kind: armor class, weapon type, off-hand)
//   wanted   hunted hours to one named Trait on a base the hero can wear (p50, p90; solo, the same hours as any party under personal loot)
//   bank     the pity's honesty across modes: 10 h in a party of four at depth 1, then 10 h alone at depth 20, repeated, against the finds
//            the two modes state. A pity that counts whole missed rolls banks them where a kill's chance is small and spends them where
//            it is big, so its ratio runs over 1; a pity that counts the finds owed reads 1
//   kit      V10's proxy until the kit sampler: after 70 and 200 h alone, the seat's Trait slots holding a piece it can wear (p10/p50/p90)
//   dials    --pity off (the roll's pityOn what-if) and --base uniform (the roll's baseFit what-if); both are the Lab's, never the server's
//
//   node tools/balance-program/redesign/drops/hero-week.mjs [--ground muster_barrows] [--samples 2000] [--seed 1] [--pity on|off]
//        [--base worn|uniform] [--only week,wanted,kit,bank,flame] [--luck 0,200,300,360] [--seats hammer,mage,bow] [--hours 40,200,1000]
//        [--json out.json]
//   flame    (lane/f1-inner-flame) the company flame's luck, as the server freezes it per hunt: the kit in steps unfed against fed at
//            40 / 200 / 1000 h and the two V10 gaps against kitSpreadMax, a hero-week's pieces at each luck, and the flame against the bank
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { HUNT_GROUNDS } from '../../../../src/data/hunt-grounds.js';
import { DANGER_GROUNDS } from '../../../../src/data/danger.js';
import { GEAR_STEPS } from '../../../../src/data/gear-steps.js';
import { DROP_HOURS } from '../../../../src/data/drop-hours.js';
import { ITEMS } from '../../../../src/data/items.js';
import { createRng, hashSeed } from '../../../../src/core/rng.js';
import { traitSwing, rollKillFor, rollableCells } from '../../../../src/core/trait-roll.js';
import { depthOf, depthRarePm, killsHeadHour, traitBasesOf } from '../../../../src/core/drop-rate.js';
import { refHeldOf } from '../../../../src/core/bands.js';
import { stepAtDepth } from './first-trait.mjs';
import { isMain } from '../../../../tests/_is-main.mjs';

/* what each seat wears: the kind it can use in a slot (the Lab's four, 12-targets 8.2) */
const SEATS = Object.freeze({
  hammer: (it) => (it.type === 'weapon' ? it.weaponType === 'hammer' : it.type === 'offhand' ? it.offhand === 'shield' : it.armourClass ? it.armourClass === 'plate' : true),
  bow: (it) => (it.type === 'weapon' ? it.weaponType === 'ranged' : it.type === 'offhand' ? false : it.armourClass ? it.armourClass === 'leather' : true),
  mage: (it) => (it.type === 'weapon' ? it.weaponType === 'magic' && it.discipline === 'destruction' : it.type === 'offhand' ? it.offhand === 'spellbook' : it.armourClass ? it.armourClass === 'cloth' : true),
  healer: (it) => (it.type === 'weapon' ? it.weaponType === 'magic' && it.discipline === 'restoration' : it.type === 'offhand' ? false : it.armourClass ? it.armourClass === 'cloth' : true),
});

/** The seat's kit on a ground: in every Trait slot the ground drops, the first of its bases the seat can use, worn in that equip slot. */
export function kitOf(groundId, seat) {
  const b = traitBasesOf(HUNT_GROUNDS[groundId], GEAR_STEPS.traitSlots, DANGER_GROUNDS[groundId].gearLevel);
  const eq = {};
  for (const [s, list] of Object.entries(b)) {
    const hit = list.find((id) => SEATS[seat](ITEMS[id]));
    if (hit) eq[GEAR_STEPS.traitSlots[s][0]] = hit;
  }
  return eq;
}

const fits = (seat, piece) => SEATS[seat](ITEMS[piece.base]);
const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const dials = (o) => ({ ...(o.pity === false ? { pityOn: { rare: false, very_rare: false } } : {}), ...(o.base ? { baseFit: o.base } : {}) });

/* one hero's run: `plan` is [[hours, n, step, luckPm?], ...] played in order (a fourth entry sets the company flame's luck for that block,
   as the server freezes it per hunt: lane/f1-inner-flame); `stop(piece)` ends it early (answers the hours it took) */
function run(groundId, seat, plan, o, i, stop) {
  const ground = HUNT_GROUNDS[groundId], kph = killsHeadHour(ground);
  const tr = { luckPm: { h: o.luckPm || 0 }, pity: {}, found: [], ...dials(o) };
  const rng = createRng(hashSeed('hero-week', groundId, seat, o.seed, i, JSON.stringify(plan), o.pity === false ? 0 : 1, o.base || ''));
  const worn = kitOf(groundId, seat);
  let t = 0;
  for (const [hours, n, step, luck] of plan) {
    if (Number.isFinite(luck)) tr.luckPm.h = luck;
    const sw = traitSwing(tr, ground, step, () => rng);
    const kills = Math.round(hours * kph * n);
    for (let k = 0; k < kills; k++) {
      const pc = rollKillFor(sw, 'h', 1, n, rng, undefined, undefined, worn);
      if (pc && stop && stop(pc)) return { hours: t + (k + 1) / (kph * n), found: tr.found };
    }
    t += hours;
  }
  return { hours: stop ? Infinity : t, found: tr.found };
}

/** Pieces in `hours` for `samples` heroes of `seat` in a party of `n` at the reference held step: { p10, p50, p90, mean, wearMean, wearP10 }. */
export function week(groundId, seat, n, o) {
  const step = refHeldOf(groundId), all = [], wear = [];
  for (let i = 0; i < o.samples; i++) {
    const { found } = run(groundId, seat, [[o.hours || 70, n, step]], o, i);
    all.push(found.length); wear.push(found.filter((p) => fits(seat, p)).length);
  }
  all.sort((a, b) => a - b); wear.sort((a, b) => a - b);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { p10: q(all, 0.1), p50: q(all, 0.5), p90: q(all, 0.9), mean: mean(all), wearP10: q(wear, 0.1), wearP50: q(wear, 0.5), wearMean: mean(wear) };
}

/** Hunted hours to `traitId` on a base `seat` can wear, solo at the reference held step: { p50, p90, mean } (capped at `cap` hours). */
export function wanted(groundId, seat, traitId, o, cap = 6000) {
  const step = refHeldOf(groundId), hs = [];
  for (let i = 0; i < o.samples; i++) {
    const r = run(groundId, seat, [[cap, 1, step]], o, i, (p) => p.traits.some((t) => t.id === traitId) && fits(seat, p));
    hs.push(Math.min(cap, r.hours));
  }
  hs.sort((a, b) => a - b);
  return { p50: q(hs, 0.5), p90: q(hs, 0.9), mean: hs.reduce((a, b) => a + b, 0) / hs.length };
}

/** THE KIT SPREAD (V10's proxy until the kit sampler): after `hours` solo at the reference held step, how many of the seat's Trait slots on
    the ground (a slot with a base it can wear) hold a piece it can wear, at the 10th, 50th and 90th percentile, of `of` such slots. */
export function kit(groundId, seat, hours, o) {
  const step = refHeldOf(groundId), b = traitBasesOf(HUNT_GROUNDS[groundId], GEAR_STEPS.traitSlots, DANGER_GROUNDS[groundId].gearLevel);
  const slots = Object.keys(rollableCells(HUNT_GROUNDS[groundId])).filter((s) => (b[s] || []).some((id) => SEATS[seat](ITEMS[id])));
  const filled = [];
  for (let i = 0; i < o.samples; i++) {
    const { found } = run(groundId, seat, [[hours, 1, step]], o, i);
    filled.push(new Set(found.filter((p) => fits(seat, p)).map((p) => p.slot)).size);
  }
  filled.sort((x, y) => x - y);
  return { of: slots.length, p10: q(filled, 0.1), p50: q(filled, 0.5), p90: q(filled, 0.9) };
}

/** THE KIT IN STEPS (V10 with the flame; 21 sections 1.6 and 1.7 F2, lane/f1-inner-flame): after `hours` solo at the reference held step
    with the company flame at `luckPm`, the conditional steps the seat's best wearable piece in each Trait slot gives (each Trait at its
    rank's GEAR_STEPS.traitSteps, a Very Rare both), summed, and the same held to the gear slice (conditionalStepsMax, the engine's clamp):
    { p10, p50, p90, mean, clampP90 }. */
export function kitSteps(groundId, seat, hours, luckPm, o) {
  const step = refHeldOf(groundId), steps = [], clamped = [];
  const val = (p) => p.traits.reduce((s, t) => s + (GEAR_STEPS.traitSteps[t.rank - 1] || 0), 0);
  for (let i = 0; i < o.samples; i++) {
    const { found } = run(groundId, seat, [[hours, 1, step, luckPm]], o, i);
    const best = new Map();
    for (const p of found) if (fits(seat, p)) best.set(p.slot, Math.max(best.get(p.slot) || 0, val(p)));
    const s = [...best.values()].reduce((a, b) => a + b, 0);
    steps.push(s); clamped.push(Math.min(GEAR_STEPS.conditionalStepsMax, s));
  }
  steps.sort((a, b) => a - b); clamped.sort((a, b) => a - b);
  return { p10: q(steps, 0.1), p50: q(steps, 0.5), p90: q(steps, 0.9), mean: steps.reduce((a, b) => a + b, 0) / steps.length, clampP90: q(clamped, 0.9) };
}

/** The flame against pity's bank (the brief: no party-to-solo bank through the flame): `cycles` of 10 h solo unfed then 10 h solo on a full
    fire (luck `full`), finds against the finds the luck states (the stated rate x (1 + luck) per block), and the same in the reverse order. */
export function flameBank(groundId, o, full, cycles = 20) {
  const step = refHeldOf(groundId);
  const perHour = (luck) => (depthRarePm(groundId, step) / 1000) * (1 + luck / 1000) * (1 / DROP_HOURS.rarity.rare.everyHours + 1 / DROP_HOURS.rarity.very_rare.everyHours);
  const out = {};
  for (const [name, a, b] of [['unfed -> full', [10, 1, step, 0], [10, 1, step, full]], ['full -> unfed', [10, 1, step, full], [10, 1, step, 0]], ['full only', [10, 1, step, full], [10, 1, step, full]]]) {
    const plan = [];
    for (let c = 0; c < cycles; c++) plan.push(a, b);
    let found = 0;
    for (let i = 0; i < o.samples; i++) found += run(groundId, 'hammer', plan, o, i).found.length;
    const stated = o.samples * plan.reduce((s, [h, , , l]) => s + h * perHour(l), 0);
    out[name] = { found, stated: Math.round(stated), ratio: found / stated };
  }
  return out;
}

/** Finds against the stated finds over `cycles` of [10 h, party of 4, depth 1] then [10 h, alone, depth 20] (and the reverse order). */
export function bank(groundId, o, cycles = 20) {
  const row = DANGER_GROUNDS[groundId], d1 = stepAtDepth(groundId, 1), d20 = row.topStep;
  const perHour = (step) => (depthRarePm(groundId, step) / 1000) * (1 / DROP_HOURS.rarity.rare.everyHours + 1 / DROP_HOURS.rarity.very_rare.everyHours);
  const out = {};
  for (const [name, a, b] of [['party d1 -> solo d20', [10, 4, d1], [10, 1, d20]], ['solo d20 -> party d1', [10, 1, d20], [10, 4, d1]], ['solo d20 only', [10, 1, d20], [10, 1, d20]]]) {
    const plan = [];
    for (let c = 0; c < cycles; c++) plan.push(a, b);
    let found = 0;
    for (let i = 0; i < o.samples; i++) found += run(groundId, 'hammer', plan, o, i).found.length;
    const stated = o.samples * plan.reduce((s, [h, , st]) => s + h * perHour(st), 0);
    out[name] = { found, stated: Math.round(stated), ratio: found / stated };
  }
  return out;
}

const runAsMain = isMain(import.meta.url);
if (runAsMain) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const groundId = arg('--ground', 'muster_barrows');
  const o = { samples: Number(arg('--samples', 2000)), seed: Number(arg('--seed', 1)), pity: arg('--pity', 'on') !== 'off', base: arg('--base', null) };
  const only = String(arg('--only', 'week,wanted,kit,bank')).split(',');
  const cells = rollableCells(HUNT_GROUNDS[groundId]);
  const res = { groundId, o, cells, step: refHeldOf(groundId), depth: depthOf(groundId, refHeldOf(groundId)) };
  console.log(`${groundId} (held step ${res.step}, depth ${res.depth}) cells ${JSON.stringify(cells)} pity ${o.pity ? 'on' : 'off'} base ${o.base || 'the data'}`);
  if (only.includes('week')) {
    res.week = {};
    for (const seat of Object.keys(SEATS)) for (const n of [1, 4]) {
      const r = week(groundId, seat, n, o);
      res.week[seat + ':' + n] = r;
      console.log(`  week ${seat.padEnd(6)} party ${n}: pieces p10 ${r.p10} p50 ${r.p50} p90 ${r.p90} mean ${r.mean.toFixed(2)} | wearable p10 ${r.wearP10} p50 ${r.wearP50} mean ${r.wearMean.toFixed(2)}`);
    }
  }
  if (only.includes('wanted')) {
    res.wanted = {};
    const ws = Math.max(200, Math.round(o.samples / 4));
    for (const seat of Object.keys(SEATS)) for (const [s, ids] of Object.entries(cells)) for (const id of ids) {
      if (!traitBasesOf(HUNT_GROUNDS[groundId], GEAR_STEPS.traitSlots, DANGER_GROUNDS[groundId].gearLevel)[s].some((b) => SEATS[seat](ITEMS[b]))) continue;
      const r = wanted(groundId, seat, id, { ...o, samples: ws });
      res.wanted[seat + ':' + id] = r;
      console.log(`  wanted ${seat.padEnd(6)} ${id.padEnd(16)} (${s}): p50 ${r.p50.toFixed(0).padStart(5)} h  p90 ${r.p90.toFixed(0).padStart(5)} h  mean ${r.mean.toFixed(0).padStart(5)} h`);
    }
  }
  if (only.includes('kit')) {
    res.kit = {};
    for (const seat of Object.keys(SEATS)) for (const h of [70, 200]) {
      const r = kit(groundId, seat, h, { ...o, samples: Math.max(200, Math.round(o.samples / 4)) });
      res.kit[seat + ':' + h] = r;
      console.log(`  kit ${seat.padEnd(6)} ${String(h).padStart(3)} h: wearable Trait slots filled p10 ${r.p10} p50 ${r.p50} p90 ${r.p90} of ${r.of}`);
    }
  }
  if (only.includes('bank')) {
    res.bank = bank(groundId, { ...o, samples: Math.max(100, Math.round(o.samples / 10)) });
    for (const [k, v] of Object.entries(res.bank)) console.log(`  bank ${k.padEnd(22)}: found ${v.found} against ${v.stated} stated, ratio ${v.ratio.toFixed(3)}`);
  }
  /* THE FLAME (lane/f1-inner-flame, 21 section 1.7 F2, 19 V10): unfed (0), own drops at Flame Level 1 and 99 (200, 300) and a full fire
     at 99 (360, the most luck the room allows); the kit in steps at 40, 200 and 1000 hunted hours, and the two V10 gaps (fed p90 against
     unfed p10, full p90 against own-drops p10), each against kitSpreadMax (conditionalStepsMax, one tier); then the flame against the bank */
  if (only.includes('flame')) {
    res.flame = { kit: {}, v10: {}, week: {} };
    const lucks = String(arg('--luck', '0,200,300,360')).split(',').map(Number);
    const seats = String(arg('--seats', 'hammer,mage,bow')).split(',');
    const hoursList = String(arg('--hours', '40,200,1000')).split(',').map(Number);
    const cap = GEAR_STEPS.conditionalStepsMax, top = Math.max(...lucks), own = lucks.includes(300) ? 300 : lucks[lucks.length - 2];
    for (const luck of lucks) {
      const w = week(groundId, 'hammer', 1, { ...o, luckPm: luck });
      res.flame.week[luck] = w;
      console.log(`  flame week hammer alone, luck +${luck / 10}%: pieces mean ${w.mean.toFixed(3)} (p10 ${w.p10} p50 ${w.p50} p90 ${w.p90})`);
    }
    for (const seat of seats) for (const h of hoursList) {
      const n = Math.max(100, Math.round(o.samples / (h >= 1000 ? 10 : 4)));
      const cell = {};
      for (const luck of lucks) cell[luck] = kitSteps(groundId, seat, h, luck, { ...o, samples: n });
      res.flame.kit[seat + ':' + h] = cell;
      const fed = cell[top].p90 - cell[0].p10, full = cell[top].p90 - cell[own].p10;
      const fedC = Math.min(cap, cell[top].p90) - Math.min(cap, cell[0].p10), fullC = Math.min(cap, cell[top].p90) - Math.min(cap, cell[own].p10);
      res.flame.v10[seat + ':' + h] = { fed, full, fedClamped: fedC, fullClamped: fullC, cap, pass: fedC <= cap && fullC <= cap };
      console.log(`  flame kit ${seat.padEnd(6)} ${String(h).padStart(4)} h (${n} heroes): ` + lucks.map((l) => `+${l / 10}% p10/p50/p90 ${cell[l].p10}/${cell[l].p50}/${cell[l].p90}`).join(' | ')
        + ` | V10 fed ${fed} (held ${fedC}), full over own ${full} (held ${fullC}) of ${cap}`);
    }
    res.flame.bank = flameBank(groundId, { ...o, samples: Math.max(100, Math.round(o.samples / 10)) }, top);
    for (const [k, v] of Object.entries(res.flame.bank)) console.log(`  flame bank ${k.padEnd(14)}: found ${v.found} against ${v.stated} stated, ratio ${v.ratio.toFixed(3)}`);
  }
  const out = arg('--json', null);
  if (out) writeFileSync(out, JSON.stringify(res, null, 1) + '\n');
}
