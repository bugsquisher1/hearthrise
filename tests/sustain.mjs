#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/sustain.mjs — SUSTAIN ON THE REFERENCE (lane/foundations-block, 2026-11-23; src/data/sustain.js, 04-math-strategy.md section 3).
//
//   node tests/sustain.mjs
//
//   SU-1  every lever's starting value sits inside its own band, the bands are shares (0 to 1000) or seconds, and the three shares'
//         starting values leave no more than the band's room unaccounted (they sum to 1000 +- 100: what the company takes, it gets back)
//   SU-2  THE MANA ECONOMY AT THE REFERENCE: the reference healer (all light armor, src/core/vitals.js maxManaFor) at Muster Barrows'
//         refLevel holds manaSeconds of casting its main heal (abilities.js greater_mend: mana a cast over its cooldown) back to back, in band
//   SU-3  THE KEPT READINGS (tools/balance-program/redesign/foundations/*-ref.json, the Steady reference four on each measured ground at its
//         refLevel): regeneration, heal spells and food each inside their band. A re-measured ground whose sustain leaves its band is red
//         until the levers or the heal rows move (a reading, so a lane that moves sustain re-runs foundations/run.mjs)
// ════════════════════════════════════════════════════════════════════════
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { SUSTAIN } = await imp('src/data/sustain.js');
const { DANGER_GROUNDS } = await imp('src/data/danger.js');
const { ABILITIES } = await imp('src/data/abilities.js');
const { ARMOUR_SLOTS } = await imp('src/data/core-model.js');
const { maxManaFor } = await imp('src/core/vitals.js');

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

/* SU-1 */
for (const [k, v] of Object.entries(SUSTAIN)) {
  const [lo, hi] = v.band;
  ok(Number.isFinite(v.at) && lo <= v.at && v.at <= hi, 'SU-1 ' + k + ' starts at ' + v.at + ', outside its band ' + lo + ' to ' + hi);
  ok(lo >= 0 && (k === 'manaSeconds' || hi <= 1000), 'SU-1 ' + k + ' band ' + lo + ' to ' + hi + ' is not a share');
}
const sum = SUSTAIN.freePm.at + SUSTAIN.healerPm.at + SUSTAIN.supplyPm.at;
ok(Math.abs(sum - 1000) <= 100, 'SU-1 the three shares start at ' + sum + ' permille of what the company takes');

/* SU-2 */
const mend = ABILITIES.greater_mend, L = DANGER_GROUNDS.muster_barrows.refLevel;
ok(mend && mend.mana > 0 && mend.cdMs > 0, 'SU-2 CONTROL: no Greater Mend row with a mana cost and a cooldown');
const pool = maxManaFor(L, ARMOUR_SLOTS.length), secs = pool / ((mend.mana * 1000) / mend.cdMs);
const [mlo, mhi] = SUSTAIN.manaSeconds.band;
ok(secs >= mlo && secs <= mhi, 'SU-2 the reference healer at Level ' + L + ' holds ' + secs.toFixed(1) + ' s of Greater Mend (pool ' + pool + '), the band is ' + mlo + ' to ' + mhi);

/* SU-3 */
const DIR = join(ROOT, 'tools', 'balance-program', 'redesign', 'foundations');
let read = 0;
for (const [name, ground] of [['muster-ref', 'muster_barrows'], ['hasks-ref', 'hasks_ford'], ['wing-ref', 'catacomb_bone_wing']]) {
  const f = join(DIR, name + '.json');
  if (!existsSync(f)) { fails.push('SU-3 no kept reading ' + f); continue; }
  const rep = JSON.parse(readFileSync(f, 'utf8')), c = rep.cells && rep.cells['base:steady'];
  ok(rep.ground === ground && rep.levels[0] === DANGER_GROUNDS[ground].refLevel, 'SU-3 ' + name + ' is not ' + ground + ' at its refLevel');
  ok(c && c.sustain, 'SU-3 ' + name + ' has no sustain reading');
  if (!c || !c.sustain) continue;
  read++;
  for (const [k, have] of [['freePm', c.sustain.freePm], ['healerPm', c.sustain.spellPm], ['supplyPm', c.sustain.foodPm]]) {
    const [lo, hi] = SUSTAIN[k].band;
    ok(have >= lo && have <= hi, 'SU-3 ' + ground + ' ' + k + ' reads ' + have + ' at the reference, its band is ' + lo + ' to ' + hi);
  }
}

if (fails.length) { console.error('✗ sustain: ' + fails.length + ' failing\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('✓ sustain: SU-1..3 (' + Object.keys(SUSTAIN).length + ' levers in band, ' + secs.toFixed(1) + ' s of mana at the reference, ' + read + ' reference readings in band)');
