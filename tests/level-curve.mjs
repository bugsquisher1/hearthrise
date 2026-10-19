#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/level-curve.mjs — THE LEVEL CURVE STAYS INSIDE THE DESIGNER'S HOURS.
//
// CORE_NUMBERS 2026-10-19 (Q2, re-ruled slower at Tyler's ask): Level XP(L) =
// (L-1)^4 + 20 (L-1)^3 + 50 (L-1) (src/data/core-model.js LEVEL_CURVE), judged
// against a hero earning LEVEL_GUARD.xpPerHourPerLevel x L Level XP an hour:
//   C1  the hours from Level 1 to 200 sum inside LEVEL_GUARD.hoursTo200
//   C2  the hours to Level 10 sit inside LEVEL_GUARD.hoursTo10 (the first evening)
//   C3  every Level costs more XP than the one before (no flat or falling step)
// A curve edit that leaves the window fails here before it reaches a player.
//
//   node tests/level-curve.mjs            run
//   node tests/level-curve.mjs --selftest each planted curve must fail a claim
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';
import { charXpForLevel } from '../src/core/xp.js';
import { LEVEL_CURVE, LEVEL_GUARD } from '../src/data/core-model.js';

/** Hours to reach `to` from Level 1 on the curve `xp(L)` at the guard's rate. */
function hoursTo(xp, to) {
  let h = 0;
  for (let l = 1; l < to; l++) h += (xp(l + 1) - xp(l)) / (LEVEL_GUARD.xpPerHourPerLevel * l);
  return h;
}

function judge(xp) {
  const out = [];
  const h200 = hoursTo(xp, 200); const h10 = hoursTo(xp, 10);
  const [a, b] = LEVEL_GUARD.hoursTo200; const [c, d] = LEVEL_GUARD.hoursTo10;
  if (!(h200 >= a && h200 <= b)) out.push(`C1: Level 200 takes ${h200.toFixed(0)} h, outside ${a}-${b}`);
  if (!(h10 >= c && h10 <= d)) out.push(`C2: Level 10 takes ${h10.toFixed(2)} h, outside ${c}-${d}`);
  for (let l = 2; l < 300; l++) if (!(xp(l + 1) - xp(l) > xp(l) - xp(l - 1))) { out.push(`C3: Level ${l + 1} costs no more than Level ${l}`); break; }
  return { out, h200, h10 };
}

const curve = (q, c, li) => (L) => { const n = L - 1; return q * n ** 4 + c * n ** 3 + li * n; };
const MUTANTS = [
  ['the cubic curve the designer rejected (too fast)', curve(0, 20, 50)],
  ['a quartic twice as steep', curve(2, 40, 100)],
  ['a linear step (flat cost a Level)', (L) => 1000 * (L - 1)],
];

function main() {
  if (process.argv.includes('--selftest')) {
    let miss = 0;
    if (judge(charXpForLevel).out.length) { console.error('level-curve --selftest: the shipped curve already fails'); process.exit(1); }
    for (const [name, xp] of MUTANTS) {
      const caught = judge(xp).out.length > 0;
      console.log(`  ${caught ? 'ok  ' : 'MISS'} ${name}`);
      if (!caught) miss++;
    }
    console.log(miss ? `level-curve --selftest: ${miss} curve(s) not caught` : `level-curve --selftest: all ${MUTANTS.length} curves caught`);
    process.exit(miss ? 1 : 0);
  }
  /* The data constant and the engine's function are one curve. */
  const fromData = curve(LEVEL_CURVE.quartic, LEVEL_CURVE.cubic, LEVEL_CURVE.linear);
  for (const L of [1, 2, 10, 100, 200]) {
    if (fromData(L) !== charXpForLevel(L)) { console.error(`level-curve: xp.js says ${charXpForLevel(L)} at Level ${L}, LEVEL_CURVE says ${fromData(L)}`); process.exit(1); }
  }
  const { out, h200, h10 } = judge(charXpForLevel);
  for (const x of out) console.error('✗ ' + x);
  console.log(out.length ? `level-curve: ${out.length} claim(s) red` : `level-curve: green (Level 10 in ${h10.toFixed(2)} h, Level 200 in ${h200.toFixed(0)} h)`);
  process.exit(out.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
