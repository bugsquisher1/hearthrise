#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/engine-profile.local.mjs — THE ONE COMBAT ENGINE, TIMED AND PROFILED (lane/r-engine-profile, 2026-11-11).
//
//   node tools/qa/engine-profile.local.mjs                         every scenario, 50 settles of 100 s, timed
//   node tools/qa/engine-profile.local.mjs --prof                  ...then each again under the V8 sampling profiler
//   node tools/qa/engine-profile.local.mjs warrens-4 --settles 20  one scenario, fewer settles
//   node tools/qa/engine-profile.local.mjs --json out.json         the numbers as JSON too
//
// One process, no browser, no network, no database. Each scenario is the world tick's settle (hr-accrue accrual.js
// accrueHunt, which runs src/core/combat-sim.js simulateHuntInstance) cut into 100 s windows the way the tick cuts a
// closed browser's hunt, the world carried between windows as its stored string (decode, simulate, encode: the
// edge's whole engine time, hunt-settle.js proposeHuntSettle `engineMs`). The heroes are the measured ladder heroes
// of tests/hunt-core/fixtures/play-ground.mjs (every combat skill at the Level, the smiths' kit for it, the
// reference supply bar), the seed pinned, so two runs on one tree play the same swings.
//
// Before the measured 50, each scenario plays a short warm-up on another seed (V8 compiles the engine there), so the
// median is the steady edge isolate's and not a cold one's.
//
// --prof samples the same scenarios with the in-process V8 profiler (node:inspector, 100 µs) and prints: self time by
// function, self time by file, and INCLUSIVE time by engine stage (each world-step sub-step hook, A*, the world codec,
// the settle's own bookkeeping). The profiler slows the run, so its shares are read as shares, never as ms per second.
//
// mutant-anchors: none — a manual measuring tool, not a CI guard
// ════════════════════════════════════════════════════════════════════════
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

/* THE SCENARIOS: the live-shaped hard grounds a party of four plays at a full box (density 8, the grounds' densityMax),
   a lone hero on the solo ground, and the 11-10 baseline's own Meadowbrook hero (the local figure to compare with). */
const SCENARIOS = Object.freeze({
  'warrens-4': { hunt: 'coppercap_warrens', L: 40, roles: ['tank', 'healer', 'ranger', 'mage'], fullSet: true, density: 8 },
  'glade-4': { hunt: 'mosslight_glade', L: 24, roles: ['tank', 'healer', 'ranger', 'mage'], fullSet: true, density: 8 },
  'glade-1': { hunt: 'mosslight_glade', L: 26, roles: ['ranger'], fullSet: true },
  'thicket-1': { hunt: 'meadowbrook_thicket', L: 10, roles: ['tank'] },
});
const SEED = '-4611686018427387904';
const WARM_SEED = '77';

const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf(name); return i < 0 ? d : argv[i + 1]; };
const SETTLES = Number(opt('--settles', 50));
const WINDOW = Number(opt('--window-ms', 100000));
const WARM = Number(opt('--warm', 6));
const PROF = argv.includes('--prof');
const JSON_OUT = opt('--json', null);
const named = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--settles', '--window-ms', '--warm', '--json'].includes(argv[i - 1])));
const pick = named.length ? named : Object.keys(SCENARIOS);
for (const n of pick) if (!SCENARIOS[n]) { console.error('engine-profile: no scenario ' + n + ' (' + Object.keys(SCENARIOS).join(', ') + ')'); process.exit(2); }

const P = await loadPlay(ROOT);

/** One scenario's settles: [{ ms, simMs, kills }] in order, plus how it ended. */
function playScenario(P, sc, settles, windowMs, secret) {
  const rows = [];
  const r = P.run(sc.hunt, sc.L, sc.roles, { spanMs: settles * windowMs, windowMs, secret, fullSet: sc.fullSet === true,
    ...(Number.isInteger(sc.density) ? { density: sc.density } : {}),
    onWindow: (out, members, engineMs) => {
      const simMs = (out.worldSwingTo - out.worldSwingFrom) * out.tickMs;
      const kills = out.events.filter((e) => e.type === 'kill').length;
      rows.push({ ms: engineMs, simMs, kills });
    } });
  return { rows, ended: r.ended, falls: r.falls };
}

const q = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : NaN; };
const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '-');
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : '-');

const report = { when: new Date().toISOString(), node: process.version, settles: SETTLES, windowMs: WINDOW, seed: SEED, scenarios: {} };
console.log('engine-profile: ' + SETTLES + ' settles of ' + WINDOW / 1000 + ' s a scenario, seed pinned, warm-up ' + WARM + ' settles on another seed. Node ' + process.version + '.');
console.log('  scenario    | heroes | settles | sim s | kills/settle | settle ms med / p95 / max | ms per sim s med / p95 | ended');
for (const name of pick) {
  const sc = SCENARIOS[name];
  if (WARM > 0) playScenario(P, sc, WARM, WINDOW, WARM_SEED);
  const t0 = performance.now();
  const { rows, ended, falls } = playScenario(P, sc, SETTLES, WINDOW, SEED);
  const wall = performance.now() - t0;
  const ms = rows.map((r) => r.ms), per = rows.map((r) => r.ms / (r.simMs / 1000)), kills = rows.map((r) => r.kills);
  const simS = rows.reduce((a, r) => a + r.simMs, 0) / 1000;
  const row = { heroes: sc.roles.length, settles: rows.length, simS, killsMed: q(kills, 0.5),
    msMed: q(ms, 0.5), msP95: q(ms, 0.95), msMax: Math.max(...ms), perMed: q(per, 0.5), perP95: q(per, 0.95),
    engineMsTotal: ms.reduce((a, b) => a + b, 0), wallMs: wall, ended, falls };
  report.scenarios[name] = row;
  console.log('  ' + name.padEnd(11) + ' | ' + String(row.heroes).padStart(6) + ' | ' + String(row.settles).padStart(7) + ' | ' + String(Math.round(simS)).padStart(5)
    + ' | ' + String(row.killsMed).padStart(12) + ' | ' + (f1(row.msMed) + ' / ' + f1(row.msP95) + ' / ' + f1(row.msMax)).padStart(25)
    + ' | ' + (f2(row.perMed) + ' / ' + f2(row.perP95)).padStart(22) + ' | ' + (ended.length ? ended.join(', ') : 'open') + (falls ? ' (' + falls + ' deaths)' : ''));
}

/* ── THE PROFILE ─────────────────────────────────────────────────────── */
/* INCLUSIVE STAGES: a sample counts once for every stage whose function stands anywhere on its stack. The sub-step hooks
   are world-step.js SUBSTEP's (an anonymous hook is named by its file:line below). */
const STAGES = Object.freeze([
  ['accrueHunt (the whole settle)', 'accrueHunt', 'accrual.js'],
  ['  simulateHuntInstance', 'simulateHuntInstance', 'combat-sim.js'],
  ['    stepSwing (the world)', 'stepSwing', 'world-step.js'],
  ['      occupancy', 'occupancy', 'movement.js'],
  ['      recordTrail', 'recordTrail', 'movement.js'],
  ['      respawnPacks', 'respawnPacks', 'pull-cycle.js'],
  ['      runPhase (pull cycle)', 'runPhase', 'pull-cycle.js'],
  ['      chooseTargets', 'chooseTargets', 'targeting.js'],
  ['      positionHeroes (roles)', 'positionHeroes', 'roles.js'],
  ['      followTrail', 'followTrail', 'movement.js'],
  ['      moveAll', 'moveAll', 'movement.js'],
  ['      holderOutside / resetPack', 'holderOutside', 'leash.js'],
  ['      resolveAttacks (damage)', 'resolveAttacks', 'damage.js'],
  ['      castAbilities', 'castAbilities', 'abilities.js'],
  ['      tickStatuses', 'tickStatuses', 'status.js'],
  ['      consume (supplies)', 'consume', 'consumables.js'],
  ['      checkStopRules', 'checkStopRules', 'conditions.js'],
  ['      clearCorpses', 'clearCorpses', 'pull-cycle.js'],
  ['      flushXpGroup', 'flushXpGroup', 'xp-share.js'],
  ['    -- inside the sub-steps (inclusive, wherever called) --', '', ''],
  ['    positionMonsters', 'positionMonsters', 'roles.js'],
  ['    tankPos', 'tankPos', 'roles.js'],
  ['    plantOpen / roomAt', 'plantOpen', 'roles.js'],
  ['    roomAt', 'roomAt', 'roles.js'],
  ['    closeIn (melee walk)', 'closeIn', 'roles.js'],
  ['    rangedPos', 'rangedPos', 'roles.js'],
  ['    keepDistance (kite)', 'keepDistance', 'roles.js'],
  ['    candidateTiles', 'candidateTiles', 'movement.js'],
  ['    standable', 'standable', 'movement.js'],
  ['    spotTaken', 'spotTaken', 'movement.js'],
  ['    setGoal', 'setGoal', 'movement.js'],
  ['    goToNearest', 'goToNearest', 'movement.js'],
  ['    A* (grid.js astar)', 'astar', 'grid.js'],
  ['    bfsTo', 'bfsTo', 'grid.js'],
  ['    bfsWithin', 'bfsWithin', 'grid.js'],
  ['    los (Bresenham)', 'los', 'grid.js'],
  ['    pickTargets', 'pickTargets', 'targeting.js'],
  ['    firstUsable', 'firstUsable', 'abilities.js'],
  ['    targetFor', 'targetFor', 'abilities.js'],
  ['    castShotOf', 'castShotOf', 'abilities.js'],
  ['    suppliesFor', 'suppliesFor', 'abilities.js'],
  ['    fire (an ability)', 'fire', 'abilities.js'],
  ['    pickSlot (conditions)', 'pickSlot', 'conditions.js'],
  ['    slotsFor (conditions)', 'slotsFor', 'conditions.js'],
  ['    bestAim (conditions)', 'bestAim', 'conditions.js'],
  ['    landHit', 'landHit', 'damage.js'],
  ['    skillLevelFromXp', 'skillLevelFromXp', 'xp.js'],
  ['    levelOf', 'levelOf', 'xp.js'],
  ['    rewardSwing (pay the swing)', 'rewardSwing', 'hunt-rewards.js'],
  ['    bornHpOf / seen (unit book)', 'bornHpOf', 'combat-sim.js'],
  ['    makeEvent', 'makeEvent', 'events.js'],
  ['  decodeWorld', 'decodeWorld', 'world-state.js'],
  ['  encodeWorld', 'encodeWorld', 'world-state.js'],
  ['  memberSide', 'memberSide', 'accrual.js'],
  ['  memberDelta', 'memberDelta', 'accrual.js'],
  ['  analyzerOf', 'analyzerOf', 'accrual.js'],
  ['garbage collector', '(garbage collector)', ''],
]);

async function profile(names) {
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.setSamplingInterval', { interval: 100 });
  await session.post('Profiler.start');
  for (const n of names) playScenario(P, SCENARIOS[n], SETTLES, WINDOW, SEED);
  const { profile: prof } = await session.post('Profiler.stop');
  session.disconnect();
  return prof;
}

function breakdown(prof) {
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const selfUs = new Map();
  const dt = prof.timeDeltas;
  for (let i = 0; i < prof.samples.length; i++) selfUs.set(prof.samples[i], (selfUs.get(prof.samples[i]) || 0) + (dt[i] || 0));
  const fileOf = (cf) => (cf.url ? basename(cf.url.replace(/\?.*$/, '')) : '');
  const fnKey = (cf) => (cf.functionName || '(anonymous)') + ' ' + fileOf(cf) + (cf.url ? ':' + (cf.lineNumber + 1) : '');
  const selfFn = new Map(), selfFile = new Map(), incl = new Map(), inclFn = new Map();
  let total = 0, engineTotal = 0;
  for (const [id, us] of selfUs) {
    const n = byId.get(id);
    total += us;
    const cf = n.callFrame;
    selfFn.set(fnKey(cf), (selfFn.get(fnKey(cf)) || 0) + us);
    const file = fileOf(cf) || cf.functionName;
    selfFile.set(file, (selfFile.get(file) || 0) + us);
    /* walk to the root once, crediting every stage on the stack once */
    const on = new Set(), onFn = new Set();
    let inEngine = false;
    for (let k = id; k !== undefined; k = parent.get(k)) {
      const c = byId.get(k).callFrame;
      if (c.url) onFn.add(fnKey(c));
      for (const [label, fn, f] of STAGES) if (fn && c.functionName === fn && (!f || fileOf(c) === f)) on.add(label);
      if (c.functionName === 'accrueHunt') inEngine = true;
    }
    if (cf.functionName === '(garbage collector)') on.add('garbage collector');
    if (inEngine) engineTotal += us;
    for (const l of on) incl.set(l, (incl.get(l) || 0) + us);
    if (inEngine) for (const f of onFn) inclFn.set(f, (inclFn.get(f) || 0) + us);
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return { total, engineTotal, selfFn: top(selfFn, 30), selfFile: top(selfFile, 20), inclFn: top(inclFn, 45), stages: STAGES.map(([l]) => [l, incl.get(l) || 0]) };
}

if (PROF) {
  console.log('\nprofile (V8 sampler, 100 µs; shares only, the profiler slows the run): ' + pick.join(', '));
  for (const name of pick) {
    const b = breakdown(await profile([name]));
    const pct = (us) => (100 * us / b.engineTotal).toFixed(1).padStart(5) + '%';
    console.log('\n── ' + name + ': ' + (b.engineTotal / 1000).toFixed(0) + ' ms sampled inside accrueHunt of ' + (b.total / 1000).toFixed(0) + ' ms');
    console.log('  INCLUSIVE by stage (share of accrueHunt):');
    for (const [l, us] of b.stages) if (us > 0 || l.includes('--')) console.log('    ' + pct(us) + '  ' + l);
    console.log('  SELF by file:');
    for (const [f, us] of b.selfFile) console.log('    ' + pct(us) + '  ' + f);
    console.log('  INCLUSIVE by function (top 45):');
    for (const [f, us] of b.inclFn) console.log('    ' + pct(us) + '  ' + f);
    console.log('  SELF by function (top 30):');
    for (const [f, us] of b.selfFn) console.log('    ' + pct(us) + '  ' + f);
    report.scenarios[name] = Object.assign(report.scenarios[name] || {}, { profile: { engineMs: b.engineTotal / 1000,
      stages: Object.fromEntries(b.stages.map(([l, us]) => [l.trim(), +(100 * us / b.engineTotal).toFixed(2)])),
      selfFile: Object.fromEntries(b.selfFile.map(([f, us]) => [f, +(100 * us / b.engineTotal).toFixed(2)])),
      selfFn: Object.fromEntries(b.selfFn.map(([f, us]) => [f, +(100 * us / b.engineTotal).toFixed(2)])) } });
  }
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
