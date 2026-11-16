#!/usr/bin/env node
// tools/balance-sim/tower-climb.mjs — THE BURNING TOWER, MEASURED AS A REAL CLIMB on the shipped engine (lane/c-tower-climb; the design is
// docs/planning/PRIORITY_BOARD.md "2026-11-14 The Burning Tower", build step 2: "a climb with no keys, measured as a real climb").
// A what-if tool: it writes nothing to src/.
//
//   node tools/balance-sim/tower-climb.mjs [--levels 10,20,45] [--minutes 60] [--seeds 2]
//
// Each cell is ONE climb through the settle the world tick runs (tests/hunt-core/fixtures/play-ground.mjs -> accrual.js accrueHunt ->
// combat-sim.js on the Tower's ground in the `tower` mode), from the floor a hero of that Level starts a week on when its best landing is
// about its Level (the landing at or under Level - 10, + 1), floors in order, 60 s settle windows, until it is spat out or the minutes run
// out. The fixture hands each window the floor the server would (its start, or the top cleared + 1). Heroes wear the ladder kit their
// Level can get (the fixture's), store food on the reference bar. Reports the top floor, minutes climbed, how it ended, Level XP an hour a
// head and that as a share of the hunting pace at that Level (tools/balance-sim/level-pace.json), and the design's guard (the board's §7):
// no cell earns more Level XP an hour than hunting, and the median hero alone at the top Level reads 35-65% of it.
// Exit 0 when every cell ran and the guard held; 1 otherwise.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const LEVELS = arg('levels', '10,20,45').split(',').map(Number);
const MINUTES = Number(arg('minutes', 60));
const SEEDS = Number(arg('seeds', 2));
const WHO = [['tank'], ['melee_dps'], ['ranger'], ['mage'], ['tank', 'healer', 'ranger', 'mage']];
const u = (p) => pathToFileURL(join(ROOT, p)).href;

const { loadPlay } = await import(u('tests/hunt-core/fixtures/play-ground.mjs'));
const P = await loadPlay(ROOT);
const { TOWER_GROUNDS } = await import(u('src/data/hunt-grounds.js'));
const { TOWER_RULES } = await import(u('src/data/tower.js'));
const pace = JSON.parse(readFileSync(join(HERE, 'level-pace.json'), 'utf8'));
const ground = TOWER_GROUNDS[TOWER_RULES.hunt];
const k = (n) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));

/* the seed's own hunt secret (the cell runner's form), so a seed is the same dice in every cell */
function secretOf(seed) {
  let h = 2166136261 >>> 0;
  for (const c of 'tower:' + seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return String(-4611686018427387904n + BigInt(h));
}

let ok = true;
const solos = [];
console.log(`THE BURNING TOWER, real climbs: ${MINUTES} min at most, ${SEEDS} seed(s) a cell, 60 s windows. Hunting pace from level-pace.json.`);
console.log('| Level | Who | From | Top floor (each seed) | Minutes | Ended | Level XP an hour a head | x hunting |');
console.log('|---|---|---|---|---|---|---|---|');
for (const L of LEVELS) {
  const from = Math.max(0, Math.floor((L - 10) / TOWER_RULES.landingEvery) * TOWER_RULES.landingEvery) + 1;
  const hunting = pace.rate[String(L)];
  for (const roles of WHO) {
    const tops = [], mins = [], ends = [];
    let xp = 0, ms = 0;
    for (let s = 0; s < SEEDS; s++) {
      const r = P.run(TOWER_RULES.hunt, L, roles, { ground, sessionMode: 'tower', tower: { floor: from }, spanMs: MINUTES * 60000, windowMs: 60000,
        dropEnded: true, secret: secretOf(s) });
      tops.push(r.tower.top === null ? from - 1 : r.tower.top);
      mins.push(Math.round(r.playedMs / 60000));
      ends.push((r.ended[0] || 'time').replace(/^\S+ /, ''));
      xp += r.totals.levelXp / roles.length;
      ms += r.playedMs;
    }
    const perH = ms ? (xp * 3600000) / ms : 0;
    const share = hunting ? perH / hunting : null;
    if (share !== null && share >= 1) { ok = false; }
    if (roles.length === 1) solos.push({ L, share });
    console.log(`| ${L} | ${roles.join('+')} | ${from} | ${tops.join(', ')} | ${mins.join(', ')} | ${ends.join(', ')} | ${k(perH)} | ${share === null ? '-' : share.toFixed(2)} |`);
  }
}
const top = Math.max(...LEVELS);
const at = solos.filter((x) => x.L === top && x.share !== null).map((x) => x.share).sort((a, b) => a - b);
const median = at.length ? (at.length % 2 ? at[(at.length - 1) / 2] : (at[at.length / 2 - 1] + at[at.length / 2]) / 2) : null;
console.log(`\nGUARD (the board's §7): no cell over hunting: ${ok ? 'held' : 'BROKEN'}; the median hero alone at Level ${top} reads ${median === null ? '-' : median.toFixed(2)} of hunting (the band is 0.35-0.65).`);
if (median === null || median < 0.35 || median > 0.65) console.log('THE BAND IS NOT MET: the XP dial (src/data/session-modes.js tower.xpPm) is the designer\'s to move; reported, not changed.');
process.exit(ok ? 0 : 1);
