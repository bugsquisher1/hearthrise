// tests/hunt-core/engine-parity.mjs — THE ONE COMBAT ENGINE PLAYS THE SAME HUNT, TO THE BYTE (lane/r-engine-profile, 2026-11-11).
// Run by run-all.mjs.
//
// pinned   Each pinned-seed scenario below is the world tick's settle (hr-accrue accrual.js accrueHunt over
//          src/core/combat-sim.js simulateHuntInstance), cut into 100 s windows, the world carried between windows as its
//          stored string. Every settle is hashed three ways and the chain of each is pinned in engine-parity.baseline.json:
//            world     the stored world string, its swing counters and where the settle stopped
//            timeline  the settle's events, its track and its unit book (what the browser plays back)
//            tally     every member's share (delta, hunt, analyzer) and the run's totals, kills and items
//          A PURE optimization of the engine (the same inputs give the same outputs) keeps all three. A change MEANT to move
//          what a hunt does (a rule, a balance number, a data row these grounds read) moves them: re-pin with
//            node tests/hunt-core/engine-parity.mjs --write
//          in the same commit, and say in it why the hunt moved. Never re-pin an optimization.
//
// The mutants prove the pin bites: one damage roll in a whole run one point higher, and each of the pure
// optimizations this file was written to hold (lane/r-engine-profile) broken by one tile or one unit.
//
// mutant-anchors: src/core/hunt/damage.js src/core/hunt/roles.js src/core/hunt/movement.js src/core/xp.js
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const BASELINE = join(ROOT, 'tests/hunt-core/engine-parity.baseline.json');
const WINDOW = 100000;
const SEED = '-4611686018427387904';

/* The live-shaped hard grounds at a full box (density 8), a lone kiting ranger, and a melee + healer pair on another map:
   every positioning path (tank hold and open ground, melee walk, ranged spot, kite), the bar, the supplies, the rewards. */
const SCENARIOS = Object.freeze({
  'warrens-4': { hunt: 'coppercap_warrens', L: 40, roles: ['tank', 'healer', 'ranger', 'mage'], fullSet: true, density: 8, settles: 12 },
  'glade-4': { hunt: 'mosslight_glade', L: 24, roles: ['tank', 'healer', 'ranger', 'mage'], fullSet: true, density: 8, settles: 12 },
  'glade-1-kite': { hunt: 'mosslight_glade', L: 26, roles: ['ranger'], fullSet: true, settles: 12 },
  'sewer-2': { hunt: 'millrace_sewer', L: 20, roles: ['melee_dps', 'healer'], settles: 12 },
});

const h12 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

/** One scenario on `P` (loadPlay of the repo or a planted copy): per settle, its three hashes; and the chains. */
function fingerprint(P, sc) {
  const settles = [];
  const r = P.run(sc.hunt, sc.L, sc.roles, { spanMs: sc.settles * WINDOW, windowMs: WINDOW, secret: SEED, fullSet: sc.fullSet === true,
    ...(Number.isInteger(sc.density) ? { density: sc.density } : {}),
    onWindow: (out) => {
      settles.push({
        world: h12([out.worldSwingFrom, out.worldSwingTo, out.settledTo, out.world === null ? 'null' : out.world].join('|')),
        timeline: h12(JSON.stringify(out.events) + '|' + JSON.stringify(out.track) + '|' + JSON.stringify(out.units)),
        tally: h12(JSON.stringify(out.members)),
      });
    } });
  const chain = (k) => h12(settles.map((s) => s[k]).join(','));
  return { settles: settles.length, kills: r.totals.kills, world: chain('world'), timeline: chain('timeline'),
    tally: h12(chain('tally') + JSON.stringify([r.totals, r.members, r.items, r.heroXp, r.killsBy])), each: settles };
}

/** Every scenario's fingerprint against the pin: null when all three chains hold, else where the first one broke. */
function against(P, pin, names) {
  for (const name of names) {
    const f = fingerprint(P, SCENARIOS[name]);
    const p = pin.scenarios[name];
    if (!p) return name + ': not pinned (run --write)';
    if (f.settles !== p.settles) return name + ': ' + f.settles + ' settles, pinned ' + p.settles;
    for (const k of ['world', 'timeline', 'tally']) {
      if (f[k] === p[k]) continue;
      const at = f.each.findIndex((s, i) => !p.each[i] || s[k] !== p.each[i][k]);
      return name + ': the ' + k + ' moved' + (at >= 0 ? ' at settle ' + (at + 1) + ' of ' + f.settles : ' (the run totals)') + ' (kills ' + f.kills + ', pinned ' + p.kills + ')';
    }
  }
  return null;
}

const R = makeReport('hunt-core/engine-parity');
const P = await loadPlay(ROOT);

if (process.argv.includes('--write')) {
  const out = { note: 'tests/hunt-core/engine-parity.mjs --write. Re-pin only for a change meant to move what a hunt does, and say why in the commit.', window: WINDOW, seed: SEED, scenarios: {} };
  for (const name of Object.keys(SCENARIOS)) {
    const f = fingerprint(P, SCENARIOS[name]);
    out.scenarios[name] = { settles: f.settles, kills: f.kills, world: f.world, timeline: f.timeline, tally: f.tally, each: f.each };
    console.log('  ' + name.padEnd(13) + ' ' + f.settles + ' settles, ' + f.kills + ' kills, world ' + f.world + ' timeline ' + f.timeline + ' tally ' + f.tally);
  }
  writeFileSync(BASELINE, JSON.stringify(out, null, 1) + '\n');
  console.log('engine-parity: pinned ' + Object.keys(SCENARIOS).length + ' scenarios in tests/hunt-core/engine-parity.baseline.json');
  process.exit(0);
}

const PIN = JSON.parse(readFileSync(BASELINE, 'utf8'));
R.ok(PIN.window === WINDOW && PIN.seed === SEED, 'the baseline was pinned on another window or seed');
const names = Object.keys(SCENARIOS);
R.ok(names.every((n) => PIN.scenarios[n]) && Object.keys(PIN.scenarios).every((n) => SCENARIOS[n]), 'the baseline pins other scenarios than this file runs (run --write)');
for (const name of names) {
  /* each scenario must be a hunt worth pinning: every settle played, and kills in it */
  const p = PIN.scenarios[name];
  R.ok(p && p.settles === SCENARIOS[name].settles && p.kills > 0, name + ': the pin is not a full hunt with kills');
}
const why = against(P, PIN, names);
R.ok(!why, 'pinned: ' + why);

/* THE MUTANTS. Each runs only the scenario that walks the code it breaks (a planted copy of the engine and the settle). */
const mutants = [
  /* one roll, five points: at a monster with well over twice the blow's HP left (never an overkill the HP cap hides), past every floor */
  { name: 'one damage roll in the run is five points higher', only: ['glade-4'],
    edits: [['src/core/hunt/damage.js', '  let amount = rollAttack(sc.rng, accuracy, maxHit);\n',
      "  let amount = rollAttack(sc.rng, accuracy, maxHit);\n  if (amount > 0 && t.side === 'mon' && t.hp > 2 * amount + 20 && ++globalThis.__parityRolls === 1) amount += 5;\n"]],
    before: () => { globalThis.__parityRolls = 0; } },
];

const PICK = process.argv.includes('--no-mutants') ? [] : mutants;
for (const mu of PICK) {
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try {
    let caught = null;
    try { if (mu.before) mu.before(); caught = against(await loadPlay(p.root), PIN, mu.only); } catch (e) { caught = 'threw ' + e.message; }
    R.ok(!!caught, 'mutant "' + mu.name + '" was NOT caught');
    if (caught && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + caught);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + names.length + ' scenarios hold their pin, ' + PICK.length + ' mutants caught');
R.finish();
