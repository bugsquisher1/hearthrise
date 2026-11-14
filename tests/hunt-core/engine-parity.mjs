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
// index-audited   THE SUB-STEP'S UNIT LISTS (src/core/hunt/unit-index.js, part 2) are kept between reads and dropped by
//                 their writers. An audit planted into the index checks EVERY answer it gives against a fresh scan of the
//                 list, through all four scenarios: a writer that forgot to drop it throws there, even where the stale
//                 answer happened not to move a hash. The audited run must also hold the pins.
// index-writers   Every line in src/core that writes a unit's `alive`, a `target` or a world's unit list is pinned below
//                 with why the index stays true (it drops the index; a hero's target is in no list; it runs between
//                 swings). A new writer fails here until it calls staleIndex(inst) or says why it needn't.
//
// mutant-anchors: src/core/hunt/damage.js src/core/hunt/roles.js src/core/hunt/movement.js src/core/hunt/grid.js src/core/hunt/targeting.js src/core/hunt/pull-cycle.js src/core/hunt/unit-index.js
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const BASELINE = join(ROOT, 'tests/hunt-core/engine-parity.baseline.json');
const WINDOW = 100000;
const SEED = '-4611686018427387904';

/* The live-shaped hard grounds at a full box (density 8), a lone kiting ranger, and a melee + healer pair on another map:
   every positioning path (tank hold and open ground, melee walk, ranged spot, kite), the bar, the supplies, the rewards. */
/* RE-PINNED 2026-11-12 (lane/d-solo-fifteen), DATA ONLY, THE ENGINE UNCHANGED. The pins were stamped on d86e0ac4f (lane/r-engine-profile, 2026-11-10). Proof, by
   laying files into an archive of that commit and running this test there: the CURRENT src/core and supabase/functions/hr-accrue over the pin's data hold
   every pin (the engine profile lane's byte-identity, played); the current src/data moves them. One current data file at a time into the pin's tree:
     src/data/party-class-xp.js  moves warrens-4, glade-4, glade-1-kite and sewer-2: the mixed party cells re-fitted for one pack on Normal (lane/d-party-xp-cells,
                                 Tyler 2026-11-11), then every cell x1150/1050 and SOLO_XP_PM 1050 -> 1150 (Tyler 2026-11-11: solo hunters +15%)
     src/data/monsters.js        moves warrens-4, glade-4 and glade-1-kite: the rows regenerated from the sheet on the XP fits (the Glade 0.90, the Warrens 0.76,
                                 the Cellar 1.28, balance-sheet.js GROUND_XP_FIT) and the Brook Bear as a heavy with most of an elite's purse (designer 2026-11-12)
     src/data/hunt-grounds.js    moves glade-4 and glade-1-kite (kills 500 -> 504, 137 -> 128): the party's own Normal pull retired and the bear standing in
                                 Vine Hollow as built (lane/c-brook-bear, Tyler 2026-11-11)
     core-model.js (the re-fitted Level curve), scaled-hunts.js, balance-sheet.js, items.js, hunt-tiers.js, hunt-xp.js and the ground packs move no pin.
   Every settle's hashes moved, the kills with them (warrens-4 221 as before). The baseline is --write on this tree.
   RE-PINNED 2026-11-13 (lane/d-no-profit-molds), DATA ONLY: glade-4's TALLY alone moved (world and timeline held, kills 536 as pinned). Cause, proved by
   putting the old row back alone (the bear's gp [13, 40]: every pin holds, exit 0): src/data/monsters.js brook_bear gp [13, 40] -> [11, 32], the purse
   back on the formula when the +10% floor it served was retired (NO PROFIT MOLDS). The Cellar's XP fit (rat 15 -> 16 XP) is on no pinned ground. */
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

/* THE INDEX AUDIT (unit-index.js current): every answer checked against a fresh build of the same list, and counted. */
const AUDIT = ['src/core/hunt/unit-index.js', '  if (!ix || ix.units !== units || ix.n !== units.length) ix = inst.ix = build(units);\n  return ix;\n',
  '  if (!ix || ix.units !== units || ix.n !== units.length) ix = inst.ix = build(units);\n'
  + "  { const f = build(units); for (const k of ['engaged', 'targeted', 'mons', 'heroes', 'heroUnits']) { const a = ix[k]; const b = f[k];"
  + " if (a.length !== b.length || a.some((u, i) => u !== b[i])) throw new Error('unit-index audit: a stale ' + k + ' list'); }"
  + ' globalThis.__indexReads = (globalThis.__indexReads || 0) + 1; }\n  return ix;\n'];
if (!process.argv.includes('--no-audit')) {
  const p = plant([AUDIT], [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try {
    globalThis.__indexReads = 0;
    let got = null;
    try { got = against(await loadPlay(p.root), PIN, names); } catch (e) { got = 'threw ' + e.message; }
    R.ok(!got, 'index-audited: ' + got);
    /* the audit must have read the index, a lot: a swing that never indexes would pass it vacuously */
    R.ok(globalThis.__indexReads > 100000, 'index-audited: the index was read ' + globalThis.__indexReads + ' times in four hunts');
    if (process.argv.includes('--verbose')) console.log('  index-audited: ' + globalThis.__indexReads + ' answers, every one a fresh scan\'s');
  } finally { p.done(); }
}

/* THE WRITERS (unit-index.js header). [file, the line as written, why the index stays true]. */
const WRITERS = [
  ['src/core/hunt-spawn.js', 'world.units = units;', 'a new world, between swings'],
  ['src/core/hunt-spawn.js', 'world.units.push(heroUnit(id, hero, roles, ground.start[Math.max(0, seat) % ground.start.length]));', 'a hero joins between swings'],
  ['src/core/hunt-spawn.js', 'world.units = world.units.filter((u) => u.id !== unitId);', 'a hero leaves between swings'],
  ['src/core/hunt-spawn.js', 'for (const u of world.units) if (u.target === unitId) u.target = null;', 'a hero leaves between swings'],
  ['src/core/hunt/leash.js', 'u.target = null;', 'resetPack drops the index'],
  ['src/core/hunt/pull-cycle.js', 'w.units.push(u);', 'placeRow drops the index'],
  ['src/core/hunt/pull-cycle.js', 'w.packs[p].alive = true;', 'a pack\'s alive, not a unit\'s'],
  ['src/core/hunt/pull-cycle.js', 'if (u && on.length) { u.target = on[i % on.length].id; staleIndex(inst); }', 'spawnAdds drops the index'],
  ['src/core/hunt/pull-cycle.js', 'u.alive = false;', 'fallen drops the index'],
  ['src/core/hunt/pull-cycle.js', 'u.target = null;', 'fallen drops the index'],
  ['src/core/hunt/pull-cycle.js', 'h.target = null;', 'a hero\'s target, in no list'],
  ['src/core/hunt/pull-cycle.js', 'for (const m of packMonsters(inst, p)) m.target = k.id;', 'startPull drops the index'],
  ['src/core/hunt/pull-cycle.js', 'w.packs[p].alive = false;', 'a pack\'s alive, not a unit\'s'],
  ['src/core/hunt/pull-cycle.js', "if (gone) { w.units = w.units.filter((u) => u.side !== 'mon' || u.alive || u.deadMs < HUNT_TUNING.corpseMs); staleIndex(inst); }", 'clearCorpses drops the index'],
  ['src/core/hunt/roles.js', 'if (m) h.target = m.id;', 'a hero\'s target, in no list'],
  ['src/core/hunt/targeting.js', 'm.target = id;', 'retarget drops the index'],
  ['src/core/hunt/targeting.js', 'if (!u.alive || !fighting) { u.target = null; continue; }', 'a hero\'s target, in no list'],
  ['src/core/hunt/targeting.js', 'u.target = id;', 'a hero\'s target, in no list'],
  ['src/core/hunt/world-state.js', 'w.units = ((o && o.units) || []).map(makeUnit);', 'a new world, between swings'],
  ['src/core/hunt/world-state.js', "w.units = enc.u.map((r) => unrow('unit', r));", 'a decoded world, between swings'],
];
{
  const re = /\.(alive|target)\s*=(?!=)|\.units\s*=(?!=)|\.units\.(push|splice|unshift|pop|shift|sort|reverse|fill|copyWithin)\(|\.units\[[^\]]*\]\s*=(?!=)/;
  const found = [];
  for (const f of readdirSync(join(ROOT, 'src/core'), { recursive: true }).filter((x) => String(x).endsWith('.js')).sort()) {
    for (const line of readFileSync(join(ROOT, 'src/core', String(f)), 'utf8').split('\n')) {
      const t = line.trim();
      if (!t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && re.test(line)) found.push('src/core/' + String(f).replace(/\\/g, '/') + '  ' + t);
    }
  }
  const pinned = WRITERS.map(([f, t]) => f + '  ' + t);
  const extra = found.filter((x) => !pinned.includes(x)), gone = pinned.filter((x) => !found.includes(x));
  R.ok(!extra.length && !gone.length && found.length === pinned.length, 'index-writers: '
    + (extra.length ? 'a new writer of alive, a target or the unit list (call staleIndex(inst) where it writes, or say why it needn\'t, and pin it here): ' + extra.join(' | ') : '')
    + (gone.length ? ' pinned writers no longer found: ' + gone.join(' | ') : '') + (found.length !== pinned.length ? ' (' + found.length + ' found, ' + pinned.length + ' pinned)' : ''));
  if (process.argv.includes('--writers')) for (const x of found) console.log('  writer: ' + x);
}

/* THE MUTANTS. Each runs only the scenario that walks the code it breaks (a planted copy of the engine and the settle). */
const mutants = [
  /* one roll, five points: at a monster with well over twice the blow's HP left (never an overkill the HP cap hides), past every floor */
  { name: 'one damage roll in the run is five points higher', only: ['glade-4'],
    edits: [['src/core/hunt/damage.js', '  let amount = rollAttack(sc.rng, accuracy, maxHit);\n',
      "  let amount = rollAttack(sc.rng, accuracy, maxHit);\n  if (amount > 0 && t.side === 'mon' && t.hp > 2 * amount + 20 && ++globalThis.__parityRolls === 1) amount += 5;\n"]],
    before: () => { globalThis.__parityRolls = 0; } },
  /* the optimizations, each broken (lane/r-engine-profile): every one must move the pin, or the pin does not hold it */
  { name: 'a ranged hero\'s spot search forgets the monsters beside a tile (roles.js besideNear)', only: ['glade-4'],
    edits: [['src/core/hunt/roles.js', 'const near = mons.filter((m) => cheb(m, c) <= r + 1);', 'const near = [];']] },
  { name: 'a spot search reads no other hero\'s claimed spot (movement.js claimsOf)', only: ['warrens-4', 'glade-4'],
    edits: [['src/core/hunt/movement.js', "if (v !== hero && v.alive && v.side === 'hero' && v.spot) out.push(v.spot);", "if (v !== hero && v.alive && v.side === 'hero' && v.spot) out.length = 0;"]] },
  { name: 'the band asked first is a step closer than the spot rule\'s (roles.js onBand)', only: ['glade-4'],
    edits: [['src/core/hunt/roles.js', 'const onBand = (x, y) => inBand((x - tgt.x) * (x - tgt.x) + (y - tgt.y) * (y - tgt.y), want);',
      'const onBand = (x, y) => inBand((x - tgt.x) * (x - tgt.x) + (y - tgt.y) * (y - tgt.y), want - 1);']] },
  { name: 'A* breaks a tie by the newest entry (grid.js heap)', only: ['warrens-4', 'glade-4'],
    edits: [['src/core/hunt/grid.js', '(a[1] === b[1] && a[2] < b[2])', '(a[1] === b[1] && a[2] > b[2])']] },
  { name: 'A* takes "too big to tell" for "sealed off" (grid.js sealedOff)', only: ['warrens-4', 'glade-4'],
    edits: [['src/core/hunt/grid.js', '      if (seen.size >= budget) return false;', '      if (seen.size >= budget) return true;']] },
  { name: 'the basic attack takes the last monster in range (targeting.js basicTarget)', only: ['glade-4'],
    edits: [['src/core/hunt/targeting.js', 'if ((cmp(a, b) || dist2(a, u) - dist2(b, u) || a.id - b.id) < 0) bi = i;', 'if ((cmp(a, b) || dist2(a, u) - dist2(b, u) || a.id - b.id) > 0) bi = i;']] },
  /* part 2: a writer that forgets the index (the audit planted beside it throws on the first stale answer). A death is read
     again in its own sub-step; a pull is mostly read again only after the sub-step drops the index anyway, so it runs with the
     sub-step's drop taken out too. A retarget moves a list only when it drops a target (no leader to turn on), which these
     hunts never meet: tests/hunt-core/targeting.mjs an-indexed-retarget-is-read-at-once holds that writer. */
  { name: 'a death leaves the index standing (pull-cycle.js fallen)', only: ['warrens-4'],
    edits: [AUDIT, ['src/core/hunt/pull-cycle.js', '  u.target = null;\n  staleIndex(inst);\n', '  u.target = null;\n']] },
  { name: 'a pull leaves the index standing, past the sub-step (pull-cycle.js startPull)', only: ['warrens-4'],
    edits: [AUDIT, ['src/core/hunt/pull-cycle.js', '  for (const m of packMonsters(inst, p)) m.target = k.id;\n  staleIndex(inst);\n', '  for (const m of packMonsters(inst, p)) m.target = k.id;\n'],
      ['src/core/hunt/world-step.js', '    inst.ix = null;\n', '']] },
  { name: 'the cast order is the list\'s, not the ids\' (abilities.js castOrder)', only: ['warrens-4', 'glade-4'],
    edits: [['src/core/hunt/abilities.js', '  return k ? [k, ...heroes.filter((u) => u !== k)] : heroes;', '  return k ? [...heroes.filter((u) => u !== k), k] : heroes;']] },
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
