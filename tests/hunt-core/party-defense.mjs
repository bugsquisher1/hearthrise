// tests/hunt-core/party-defense.mjs — A SECOND TANK TRAINS DEFENSE, BROWSER CLOSED (Andy 2026-10-21:
// "Challenge spell not changing monster target. 2nd char doesn't increase.. Defense is still 1").
// Run by run-all.mjs.
//
//   second-tank-defense   two shield heroes in the Sewer on the real settle (play-ground.mjs: the hr-accrue
//                         accrueHunt the world tick runs, ten-minute windows, nobody watching): BOTH earn
//                         Defense XP, each at least a quarter of the pair's. Live v0.2.22: the second hero
//                         earned none in 4,384 settles (226 XP, its start), because the leader's own
//                         Challenge took the pack back 100 ms after every Challenge of the second.
//
// The viewed half (the browser's engine shows the second tank's Challenge and the swings it takes):
// tests/hunt-live.mjs LV-T.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

/** The case on a play runner `P`: answers the failure or null. */
function secondTankDefense(P, quiet) {
  const x = P.run('millrace_sewer', 15, ['tank', 'tank'], { spanMs: 600000 });
  const d = x.heroes.map((k) => Math.round((x.heroXp[k] || {}).defense || 0));
  const all = d[0] + d[1];
  if (!quiet) console.log('  second-tank-defense: Sewer, two L15 tanks, 10 min, browser closed: Defense XP ' + d.join(' / ') + ', falls ' + x.falls);
  if (x.falls) return 'a tank fell in the measurement (' + x.ended.join(', ') + ')';
  if (!(all > 0)) return 'neither tank earned Defense XP';
  return d.every((n) => n >= all / 4) ? null : 'Defense XP ' + d.join(' / ') + ': a tank earned under a quarter of the pair\'s';
}

const R = makeReport('hunt-core/party-defense');
let why = null;
try { why = secondTankDefense(await loadPlay(ROOT), false); } catch (e) { why = 'threw ' + (e && e.stack || e); }
R.ok(!why, 'second-tank-defense: ' + why);

const MUTANTS = [
  { name: 'a held monster is Challenged straight back (live v0.2.22)',
    edits: [['src/core/hunt/targeting.js', 'm.target !== k.id && !(m.holdMs > 0) && cheb(m, k)', 'm.target !== k.id && cheb(m, k)']] },
  { name: 'a monster blow at an armoured hero pays no Defense',
    edits: [['src/core/hunt-rewards.js', "  if (!m || m.armoured !== true || !attacker || attacker.side !== 'mon') return 0;", '  return 0;']] },
];
for (const mu of MUTANTS) {
  const p = plant(mu.edits, PLAY_TREES);
  try {
    let w = null;
    try { w = secondTankDefense(await loadPlay(p.root), true); } catch (e) { w = 'threw ' + e.message; }
    R.ok(!!w, 'mutant "' + mu.name + '" was NOT caught by second-tank-defense');
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  1 case, ' + MUTANTS.length + ' mutants caught');
R.finish();
