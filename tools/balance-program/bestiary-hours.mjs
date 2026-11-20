#!/usr/bin/env node
// tools/balance-program/bestiary-hours.mjs — HOW MANY HOURS IS A GROUND'S BESTIARY? (balance program, dive 27, question 4)
//
// Reads tools/balance-program/ref.json (party kills an hour at each reference point, lone and four) and each ground's
// spawn weights (src/data/hunts.js `spawns[].w`), and prints the hunted hours to each kill stage of each creature:
// the built trophy ladder (src/data/bestiary.js TROPHY_STAGES) and the Luck v3.1 stages (docs/design/itemization-plan.md
// "What the Bestiary gives": 100 / 500 / 2,500 / 10,000 / 40,000 / 160,000 account kills, Luck paid once a stage).
// A creature's share of kills is its spawn weight over the ground's weights: an estimate, since packs are authored
// (hunt-grounds.js pockets) and a boss is called, so the output is READ FROM DATA x MEASURED, never a measured drop.
// Writes nothing. node tools/balance-program/bestiary-hours.mjs [--seat lone|four]
// mutant-anchors: none — a measuring tool, not a guard
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HUNT_INDEX } from '../../src/data/hunts.js';
import { TROPHY_STAGES } from '../../src/data/bestiary.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(join(HERE, 'ref.json'), 'utf8'));
const LUCK = [[100, 50], [500, 150], [2500, 500], [10000, 1500], [40000, 5000], [160000, 15000]];
const seat = process.argv.includes('--seat') ? process.argv[process.argv.indexOf('--seat') + 1] : null;
const h = (n) => (n < 10 ? n.toFixed(1) : String(Math.round(n)));

console.log('point | seat | party kills/h | creature (share) | hours to Luck stage 100 / 500 / 2,500 / 10,000 / 40,000 / 160,000 | hours to built trophy 2,500 / 20,000');
for (const [id, p] of Object.entries(ref.points)) {
  const hunt = HUNT_INDEX[p.ground];
  if (!hunt || !Array.isArray(hunt.spawns)) continue;
  const total = hunt.spawns.reduce((n, s) => n + s.w, 0);
  for (const [sid, s] of Object.entries(p.seats)) {
    if (seat && sid !== seat) continue;
    let groundLuckH = 0, groundLuck = 0;
    for (const sp of hunt.spawns) {
      const perH = s.killsPerH * sp.w / total;
      const luck = LUCK.map(([at]) => h(at / perH)).join(' / ');
      const built = [TROPHY_STAGES[0].at, TROPHY_STAGES[TROPHY_STAGES.length - 1].at].map((at) => h(at / perH)).join(' / ');
      console.log([id + ' L' + p.level, sid, s.killsPerH, sp.monster + ' (' + Math.round(100 * sp.w / total) + '%, ' + sp.rarity + ')', luck, built].join(' | '));
      groundLuckH = Math.max(groundLuckH, 10000 / perH);
      groundLuck += 50 + 150 + 500 + 1500;
    }
    console.log([id + ' L' + p.level, sid, '', 'WHOLE GROUND to stage 10,000 on every creature', h(groundLuckH) + ' h (set by its rarest spawn)', 'Luck paid: ' + groundLuck].join(' | '));
  }
}
