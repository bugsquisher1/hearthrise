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

/** The case on a play runner `P`: answers the failure or null.
    ONE HOLDER A LAP (designer 2026-10-21, Option A; live v0.2.24: the two tanks traded the pack every 8 s,
    "monsters are retargeting onto the secondary member often"): over several laps of the route no monster is
    ever turned onto a second tank within a lap (every `target` event of a lap names one tank at most), and the
    holder rotating lap by lap gives each tank at least a quarter of the pair's Defense XP. */
const ROUTE0 = (await import(pathToFileURL(join(ROOT, 'src/data/hunt-grounds.js')).href)).HUNT_GROUNDS.millrace_sewer.route[0];
function secondTankDefense(P, quiet) {
  let lap = -1, laps = 0, mixed = 0;
  const lapTanks = [];
  const x = P.run('millrace_sewer', 15, ['tank', 'tank'], { spanMs: 1800000, onWindow: (out) => {
    const tanks = new Set(out.members.map((p) => p.hunt.unit_id));
    for (const e of out.events || []) {
      if (e.type === 'pull' && e.pocket === ROUTE0) { lap++; laps++; lapTanks[lap] = new Set(); }
      if (e.type === 'target' && tanks.has(e.t) && lap >= 0) {
        lapTanks[lap].add(e.t);
        if (lapTanks[lap].size > 1) mixed++;
      }
    }
  } });
  const d = x.heroes.map((k) => Math.round((x.heroXp[k] || {}).defense || 0));
  const all = d[0] + d[1];
  if (!quiet) console.log('  second-tank-defense: Sewer, two L15 tanks, 30 min, browser closed: ' + laps + ' laps, holders by lap ['
    + lapTanks.map((s) => [...s].join('+') || 'leader').join(', ') + '], ' + mixed + ' mid-lap steal(s); Defense XP ' + d.join(' / ') + ', falls ' + x.falls);
  if (x.falls) return 'a tank fell in the measurement (' + x.ended.join(', ') + ')';
  if (laps < 3) return 'CONTROL: only ' + laps + ' lap(s) in 30 min';
  if (mixed) return mixed + ' time(s) a monster was turned onto a second tank within one lap';
  if (!(all > 0)) return 'neither tank earned Defense XP';
  return d.every((n) => n >= all / 4) ? null : 'Defense XP ' + d.join(' / ') + ': a tank earned under a quarter of the pair\'s';
}

/* THE TANK HOLDS (Tyler 2026-10-16; designer 2026-10-21: the hold equals the Challenge cooldown): a party of
   one tank, a Ranger, a Mage and a Healer plays the Sewer 10 min on the real settle, and no monster ever turns
   on a hero that is not a tank (a `target` event naming one). With a 6 s hold under the 8 s cooldown the pack
   was free 2 s in every 8 and the Healer's peel drew it. */
const DENSITY = Number(process.env.PD_DENSITY || 8);
function loneTankHolds(P, quiet) {
  const roles = ['tank', 'ranger', 'mage', 'healer'];
  let off = 0, switches = 0, swings = 0;
  const x = P.run('millrace_sewer', 15, roles, { spanMs: 600000, density: DENSITY, onWindow: (out, members) => {
    const ids = new Map(out.members.map((p) => [p.hunt.unit_id, members.find((m) => m.key === p.key)]));
    const nonTank = new Set([...ids].filter(([, m]) => m && m.hero.role !== 'tank').map(([id]) => id));
    for (const e of out.events || []) {
      if (e.type === 'target') { switches++; if (nonTank.has(e.t)) off++; }
      /* the control: monsters swing at heroes all run long (the events are the window's, not empty) */
      if ((e.type === 'dmg' || e.type === 'miss') && ids.has(e.t) && !ids.has(e.u)) swings++;
    }
  } });
  if (!quiet) console.log('  lone-tank-holds: Sewer, tank + ranger + mage + healer at L15, 10 min, browser closed: ' + swings + ' monster swings at heroes, ' + switches + ' target switch(es), ' + off + ' onto a non-tank, ' + x.kills + ' kills/h, falls ' + x.falls);
  if (!(x.kills > 0) || swings < 50) return 'CONTROL: the party killed ' + x.kills + '/h and took ' + swings + ' swings (no fight to measure)';
  return off === 0 ? null : off + ' time(s) a monster turned on a hero that is not the tank';
}

const R = makeReport('hunt-core/party-defense');
const P0 = await loadPlay(ROOT);
let why = null;
try { why = secondTankDefense(P0, false); } catch (e) { why = 'threw ' + (e && e.stack || e); }
R.ok(!why, 'second-tank-defense: ' + why);
let why2 = null;
try { why2 = loneTankHolds(P0, false); } catch (e) { why2 = 'threw ' + (e && e.stack || e); }
R.ok(!why2, 'lone-tank-holds: ' + why2);

/* lone-tank-holds' own proof: the measure sees a monster turn on the Healer when one can (her peel drawing any
   free monster, every swing) */
const LONE_MUTANTS = [
  { name: 'the Healer\'s peel draws any unheld monster, every swing',
    edits: [['src/core/hunt/targeting.js', 'const free = engaged(inst).filter((m) => m.target === k.id && m.queued && !(m.holdMs > 0) && cheb(m, k) > 1);\n  if (!free.length || sc.rng.int(1, 1000) > row.peel) return null;',
      'const free = engaged(inst).filter((m) => m.target === k.id && !(m.holdMs > 0));\n  if (!free.length) return null;']] },
];
for (const mu of LONE_MUTANTS) {
  const p = plant(mu.edits, PLAY_TREES);
  try {
    let w = null;
    try { w = loneTankHolds(await loadPlay(p.root), true); } catch (e) { w = 'threw ' + e.message; }
    R.ok(!!w && !w.startsWith('CONTROL') && !w.startsWith('threw'), 'mutant "' + mu.name + '" was NOT caught by lone-tank-holds (' + w + ')');
  } finally { p.done(); }
}

const MUTANTS = [
  { name: 'a non-holder steals from the holder (the v0.2.24 trade)',
    edits: [['src/core/hunt/targeting.js', ' && (holds || onNonTank(m)));', ');']] },
  { name: 'the holder never rotates (the second tank never trains)',
    edits: [['src/core/hunt/targeting.js', 'return tanks[(first + runs) % tanks.length];', 'return tanks[first];']] },
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
if (!R.fails.length) console.log('  2 cases, ' + (MUTANTS.length + LONE_MUTANTS.length) + ' mutants caught');
R.finish();
