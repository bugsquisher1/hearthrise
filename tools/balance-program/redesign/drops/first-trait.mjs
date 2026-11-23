#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/drops/first-trait.mjs — HOURS TO A HERO'S FIRST TRAIT PIECE, ON THE REAL ROLLER (lane/drop-formula, 2026-11-22).
//
// 04-math-strategy.md section 10 validation ("the hours to a first Trait piece, read at the 10th, 50th and 90th percentile", DROP-2) and
// 21 section 4.7 L2 (pity: p90 under 2x the mean). Each sample is ONE hero of an n-hero party holding one step of a scale ground: it is at
// every one of the party's kills (refKillsHead x n an hour) and rolls src/core/trait-roll.js rollKillFor on each, its own seeded stream,
// until its first Rare or Very Rare. Kills an hour are the ground's measured reference (DANGER_GROUNDS refKillsHead), so this reads the
// roller and the hours together; how many kills an hour a company really makes at another depth is the engine's (v1-climb.mjs), not this.
//
//   node tools/balance-program/redesign/drops/first-trait.mjs [--ground muster_barrows] [--samples 1000] [--seed 1] [--json out.json]
//   cells: depth 1, the reference step, depth 20; party 1 and 4; flame luck 0, +200 (own drops, 21 1.2), +360 (kept full); pity on and off
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { HUNT_GROUNDS } from '../../../../src/data/hunt-grounds.js';
import { DANGER_GROUNDS } from '../../../../src/data/danger.js';
import { createRng, hashSeed } from '../../../../src/core/rng.js';
import { traitSwing, rollKillFor } from '../../../../src/core/trait-roll.js';
import { depthOf } from '../../../../src/core/drop-rate.js';

/** The step of `depth` on a ground's band (the lowest step that reads it). */
export function stepAtDepth(groundId, depth) {
  const row = DANGER_GROUNDS[groundId];
  for (let s = row.floorStep; s <= row.topStep; s++) if (depthOf(groundId, s) === depth) return s;
  return row.topStep;
}

/**
 * Hours to the first Trait piece for `samples` heroes: { p10, p50, p90, mean, rarities: { rare, very_rare } }.
 * `pity` false plays the same roller with pity off (the roll's pityOn what-if dial; the data's switch is GEAR_STEPS.pity).
 */
export function firstTraitHours({ groundId, step, n = 4, luckPm = 0, samples = 1000, seed = 1, pity = true, capHours = 2000 }) {
  const ground = HUNT_GROUNDS[groundId];
  const kph = DANGER_GROUNDS[groundId].refKillsHead || 120;
  const perHour = kph * n;
  const hours = [];
  const rarities = { rare: 0, very_rare: 0 };
  for (let i = 0; i < samples; i++) {
    const tr = { luckPm: { h: luckPm }, pity: {}, found: [], ...(pity ? {} : { pityOn: { rare: false, very_rare: false } }) };
    const rng = createRng(hashSeed('first-trait', groundId, step, n, luckPm, pity ? 1 : 0, seed, i));
    const sw = traitSwing(tr, ground, step, () => rng);
    let k = 0;
    const cap = capHours * perHour;
    for (; k < cap; k++) {
      if (rollKillFor(sw, 'h', 1, n, rng)) break;
    }
    hours.push((k + 1) / perHour);
    if (tr.found.length) rarities[tr.found[0].rarity] += 1;
  }
  hours.sort((a, b) => a - b);
  const q = (p) => hours[Math.min(hours.length - 1, Math.floor(p * hours.length))];
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9), mean: hours.reduce((a, b) => a + b, 0) / hours.length, rarities };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const groundId = arg('--ground', 'muster_barrows');
  const samples = Number(arg('--samples', 1000)), seed = Number(arg('--seed', 1));
  const row = DANGER_GROUNDS[groundId];
  const cells = [];
  const depths = [['depth 1', stepAtDepth(groundId, 1)], ['reference', row.refStep], ['depth 20', row.topStep]];
  for (const [where, step] of depths) {
    for (const n of [1, 4]) {
      for (const luckPm of [0, 200, 360]) {
        for (const pity of [true, false]) {
          if (!pity && (luckPm !== 0 || n !== 4)) continue;
          const r = firstTraitHours({ groundId, step, n, luckPm, samples, seed, pity });
          cells.push({ groundId, where, step, depth: depthOf(groundId, step), n, luckPm, pity, ...r });
          console.log(`${groundId} ${where.padEnd(9)} (step ${step}, depth ${String(depthOf(groundId, step)).padStart(2)}) party ${n} luck +${String(luckPm / 10).padStart(2)}% pity ${pity ? 'on ' : 'off'}`
            + `  p10 ${r.p10.toFixed(1).padStart(6)} h  p50 ${r.p50.toFixed(1).padStart(6)} h  p90 ${r.p90.toFixed(1).padStart(6)} h  mean ${r.mean.toFixed(1).padStart(6)} h  p90/mean ${(r.p90 / r.mean).toFixed(2)}  VR ${r.rarities.very_rare}/${samples}`);
        }
      }
    }
  }
  const out = arg('--json', null);
  if (out) writeFileSync(out, JSON.stringify({ samples, seed, cells }, null, 1) + '\n');
}
