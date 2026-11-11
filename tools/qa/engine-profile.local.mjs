#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/qa/engine-profile.local.mjs — THE ONE COMBAT ENGINE, TIMED AND PROFILED (lane/r-engine-profile, 2026-11-11).
//
//   node tools/qa/engine-profile.local.mjs                         every scenario, 50 settles of 100 s, timed
//   node tools/qa/engine-profile.local.mjs --prof                  ...then each again under the V8 sampling profiler
//   node tools/qa/engine-profile.local.mjs --prof --focus castAbilities   the by-function lists inside one function only
//   node tools/qa/engine-profile.local.mjs warrens-4 --settles 20  one scenario, fewer settles
//   node tools/qa/engine-profile.local.mjs --json out.json         the numbers as JSON too
//   node tools/qa/engine-profile.local.mjs --base origin/main      A/B: this tree against that commit's engine
//
// One process (one at a time for --base), no browser, no network, no database. Each scenario is the world tick's
// settle (hr-accrue accrual.js accrueHunt, which runs src/core/combat-sim.js simulateHuntInstance) cut into 100 s
// windows the way the tick cuts a closed browser's hunt, the world carried between windows as its stored string
// (decode, simulate, encode: the edge's whole engine time, hunt-settle.js proposeHuntSettle `engineMs`). The heroes
// are the measured ladder heroes of tests/hunt-core/fixtures/play-ground.mjs (every combat skill at the Level, the
// smiths' kit for it, the reference supply bar), the seed pinned, so two runs on one tree play the same swings.
//
// Before the measured 50, each scenario plays a short warm-up on another seed (V8 compiles the engine there), so the
// median is the steady edge isolate's and not a cold one's. Beside wall time each run reads this thread's CPU time
// round the whole measured run: a lane-loaded PC preempts the process, which wall time counts and CPU time does not.
//
// --base <git ref> reads that commit's engine (src/core, src/data, the hr-accrue settle) into a temp dir with one
// `git cat-file --batch`, then runs this file once a side (--root <dir>: the engine tree a run loads), alternating
// which side goes first, --reps times (default 3), one process at a time, so the same PC load lands on both sides and
// no two engines share a process (two engine copies in one process skew each other's JIT: a lone Thicket tank read
// +10% in one process and -9% in two). It prints both sides' medians, wall totals and thread-CPU totals (the robust
// figure on a loaded PC). A base whose pinned scenario plays another hunt (other kills) is refused: that is not an
// optimization, and its time says nothing.
//
// --prof samples the same scenarios with the in-process V8 profiler (node:inspector, 100 µs) and prints INCLUSIVE time
// by engine stage (each world-step sub-step hook, A*, the world codec, the settle's own bookkeeping), self time by
// file, and inclusive and self time by function. The profiler slows the run: read its shares as shares, never as ms.
//
// mutant-anchors: none — a manual measuring tool, not a CI guard
// ════════════════════════════════════════════════════════════════════════
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync, readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Session } from 'node:inspector/promises';

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), '..', '..');
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
const VALUED = ['--settles', '--window-ms', '--warm', '--json', '--base', '--reps', '--focus', '--root'];
const opt = (name, d) => { const i = argv.indexOf(name); return i < 0 ? d : argv[i + 1]; };
const SETTLES = Number(opt('--settles', 50));
const WINDOW = Number(opt('--window-ms', 100000));
const WARM = Number(opt('--warm', 6));
const PROF = argv.includes('--prof');
/* --focus <function name>: the by-function lists count only the samples with that function on the stack (what it spends its time on) */
const FOCUS = opt('--focus', null);
const JSON_OUT = opt('--json', null);
const BASE = opt('--base', null);
const REPS = Number(opt('--reps', 3));
const ENGINE_ROOT = opt('--root', ROOT);
const named = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const pick = named.length ? named : Object.keys(SCENARIOS);
for (const n of pick) if (!SCENARIOS[n]) { console.error('engine-profile: no scenario ' + n + ' (' + Object.keys(SCENARIOS).join(', ') + ')'); process.exit(2); }

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
const pc = (a, b) => ((b / a - 1) * 100).toFixed(1) + '%';
/* This thread's CPU (user + system). Windows updates it every ~16 ms, so it is read round a whole run (seconds), never one settle. */
const cpuMs = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };

const report = { when: new Date().toISOString(), node: process.version, settles: SETTLES, windowMs: WINDOW, seed: SEED, scenarios: {} };

/* ── A/B AGAINST A BASE COMMIT ───────────────────────────────────────── */
/** That commit's engine and settle, written into a temp dir (one `git cat-file --batch`, no checkout, no index touched). */
function baseTree(ref) {
  const dir = mkdtempSync(join(tmpdir(), 'engine-base-'));
  const ls = spawnSync('git', ['-C', ROOT, 'ls-tree', '-r', '--name-only', ref, '--', 'src/core', 'src/data', 'src/build-info.js', 'supabase/functions/hr-accrue'],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (ls.status !== 0) throw new Error('engine-profile: git ls-tree ' + ref + ' failed: ' + ls.stderr);
  const files = ls.stdout.split('\n').filter((f) => f && !/\.(png|webp)$/i.test(f));
  const cat = spawnSync('git', ['-C', ROOT, 'cat-file', '--batch'], { input: files.map((f) => ref + ':' + f).join('\n') + '\n', maxBuffer: 1 << 30 });
  if (cat.status !== 0) throw new Error('engine-profile: git cat-file failed: ' + String(cat.stderr));
  const buf = cat.stdout;
  let at = 0;
  for (const f of files) {
    const nl = buf.indexOf(10, at);
    const size = Number(buf.toString('utf8', at, nl).split(' ')[2]);   // "<sha> blob <size>"
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), buf.subarray(nl + 1, nl + 1 + size));
    at = nl + 1 + size + 1;
  }
  return dir;
}

if (BASE) {
  const dir = baseTree(BASE);
  const out = join(dir, 'side.json');
  const side = { base: {}, head: {} };
  try {
    console.log('engine-profile A/B: this tree (head) against ' + BASE + ' (base), ' + REPS + ' reps of ' + SETTLES + ' settles a side, one process a side, Node ' + process.version + '.');
    for (let r = 0; r < REPS; r++) {
      for (const k of r % 2 ? ['head', 'base'] : ['base', 'head']) {
        const run = spawnSync(process.execPath, [SELF, ...pick, '--settles', String(SETTLES), '--window-ms', String(WINDOW), '--warm', String(WARM),
          '--root', k === 'base' ? dir : ROOT, '--json', out], { encoding: 'utf8', maxBuffer: 1 << 26 });
        if (run.status !== 0) throw new Error('engine-profile: the ' + k + ' run failed: ' + run.stderr);
        const got = JSON.parse(readFileSync(out, 'utf8')).scenarios;
        for (const name of pick) {
          const s = side[k][name] = side[k][name] || { per: [], wall: 0, cpu: 0, kills: got[name].kills };
          s.per.push(...got[name].per); s.wall += got[name].engineMsTotal; s.cpu += got[name].cpuMs;
        }
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  console.log('  scenario    | ms per sim s: base med / p95 | head med / p95 | median   | engine wall ms, total       | thread CPU ms, total');
  for (const name of pick) {
    const b = side.base[name], h = side.head[name];
    if (b.kills !== h.kills) { console.log('  ' + name.padEnd(11) + ' | REFUSED: base plays ' + b.kills + ' kills, head ' + h.kills + ' (another hunt, not an optimization)'); continue; }
    const mb = q(b.per, 0.5), mh = q(h.per, 0.5);
    report.scenarios[name] = { ab: { base: BASE, reps: REPS, baseMed: mb, baseP95: q(b.per, 0.95), headMed: mh, headP95: q(h.per, 0.95),
      baseWallMs: b.wall, headWallMs: h.wall, baseCpuMs: b.cpu, headCpuMs: h.cpu } };
    console.log('  ' + name.padEnd(11) + ' | ' + (f2(mb) + ' / ' + f2(q(b.per, 0.95))).padStart(28) + ' | ' + (f2(mh) + ' / ' + f2(q(h.per, 0.95))).padStart(14)
      + ' | ' + pc(mb, mh).padStart(8) + ' | ' + (Math.round(b.wall) + ' -> ' + Math.round(h.wall) + ' (' + pc(b.wall, h.wall) + ')').padStart(27)
      + ' | ' + Math.round(b.cpu) + ' -> ' + Math.round(h.cpu) + ' (' + pc(b.cpu, h.cpu) + ')');
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  process.exit(0);
}

/* ── ONE TREE, TIMED ─────────────────────────────────────────────────── */
const P = await loadPlay(ENGINE_ROOT);
console.log('engine-profile: ' + SETTLES + ' settles of ' + WINDOW / 1000 + ' s a scenario, seed pinned, warm-up ' + WARM + ' settles on another seed. Node ' + process.version + '.');
console.log('  scenario    | heroes | settles | sim s | kills/settle | settle ms med / p95 / max | ms per sim s med / p95 | ended');
for (const name of pick) {
  const sc = SCENARIOS[name];
  if (WARM > 0) playScenario(P, sc, WARM, WINDOW, WARM_SEED);
  const t0 = performance.now(), c0 = cpuMs();
  const { rows, ended, falls } = playScenario(P, sc, SETTLES, WINDOW, SEED);
  const wall = performance.now() - t0, cpu = cpuMs() - c0;
  const ms = rows.map((r) => r.ms), per = rows.map((r) => r.ms / (r.simMs / 1000)), kills = rows.map((r) => r.kills);
  const simS = rows.reduce((a, r) => a + r.simMs, 0) / 1000;
  const row = { heroes: sc.roles.length, settles: rows.length, simS, killsMed: q(kills, 0.5),
    msMed: q(ms, 0.5), msP95: q(ms, 0.95), msMax: Math.max(...ms), perMed: q(per, 0.5), perP95: q(per, 0.95),
    engineMsTotal: ms.reduce((a, b) => a + b, 0), wallMs: wall, cpuMs: cpu, kills: kills.reduce((a, b) => a + b, 0), per, ended, falls };
  report.scenarios[name] = row;
  console.log('  ' + name.padEnd(11) + ' | ' + String(row.heroes).padStart(6) + ' | ' + String(row.settles).padStart(7) + ' | ' + String(Math.round(simS)).padStart(5)
    + ' | ' + String(row.killsMed).padStart(12) + ' | ' + (f1(row.msMed) + ' / ' + f1(row.msP95) + ' / ' + f1(row.msMax)).padStart(25)
    + ' | ' + (f2(row.perMed) + ' / ' + f2(row.perP95)).padStart(22) + ' | ' + (ended.length ? ended.join(', ') : 'open') + (falls ? ' (' + falls + ' deaths)' : ''));
}

/* ── THE PROFILE ─────────────────────────────────────────────────────── */
/* INCLUSIVE STAGES: a sample counts once for every stage whose function stands anywhere on its stack. The sub-step hooks
   are world-step.js SUBSTEP's; below them, the functions the 2026-11-11 profile found hot, wherever they are called from. */
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
    const cf = byId.get(id).callFrame;
    total += us;
    const file = fileOf(cf) || cf.functionName;
    selfFile.set(file, (selfFile.get(file) || 0) + us);
    /* walk to the root once, crediting every stage and every function on the stack once */
    const on = new Set(), onFn = new Set();
    let inEngine = false, focused = !FOCUS;
    for (let k = id; k !== undefined; k = parent.get(k)) {
      const c = byId.get(k).callFrame;
      if (c.url) onFn.add(fnKey(c));
      for (const [label, fn, f] of STAGES) if (fn && c.functionName === fn && (!f || fileOf(c) === f)) on.add(label);
      if (c.functionName === 'accrueHunt') inEngine = true;
      if (c.functionName === FOCUS) focused = true;
    }
    if (cf.functionName === '(garbage collector)') on.add('garbage collector');
    if (inEngine) engineTotal += us;
    for (const l of on) incl.set(l, (incl.get(l) || 0) + us);
    if (inEngine && focused) for (const f of onFn) inclFn.set(f, (inclFn.get(f) || 0) + us);
    if (focused) selfFn.set(fnKey(cf), (selfFn.get(fnKey(cf)) || 0) + us);
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return { total, engineTotal, selfFn: top(selfFn, 30), selfFile: top(selfFile, 20), inclFn: top(inclFn, 45), stages: STAGES.map(([l]) => [l, incl.get(l) || 0]) };
}

if (PROF) {
  console.log('\nprofile (V8 sampler, 100 µs; shares only, the profiler slows the run): ' + pick.join(', '));
  for (const name of pick) {
    const b = breakdown(await profile([name]));
    const pct = (us) => (100 * us / b.engineTotal).toFixed(1).padStart(5) + '%';
    const within = FOCUS ? ', samples inside ' + FOCUS + ' only' : '';
    console.log('\n── ' + name + ': ' + (b.engineTotal / 1000).toFixed(0) + ' ms sampled inside accrueHunt of ' + (b.total / 1000).toFixed(0) + ' ms');
    console.log('  INCLUSIVE by stage (share of accrueHunt):');
    for (const [l, us] of b.stages) if (us > 0 || l.includes('--')) console.log('    ' + pct(us) + '  ' + l);
    console.log('  SELF by file:');
    for (const [f, us] of b.selfFile) console.log('    ' + pct(us) + '  ' + f);
    console.log('  INCLUSIVE by function (top 45)' + within + ':');
    for (const [f, us] of b.inclFn) console.log('    ' + pct(us) + '  ' + f);
    console.log('  SELF by function (top 30)' + within + ':');
    for (const [f, us] of b.selfFn) console.log('    ' + pct(us) + '  ' + f);
    report.scenarios[name] = Object.assign(report.scenarios[name] || {}, { profile: { engineMs: b.engineTotal / 1000,
      stages: Object.fromEntries(b.stages.map(([l, us]) => [l.trim(), +(100 * us / b.engineTotal).toFixed(2)])),
      selfFile: Object.fromEntries(b.selfFile.map(([f, us]) => [f, +(100 * us / b.engineTotal).toFixed(2)])),
      selfFn: Object.fromEntries(b.selfFn.map(([f, us]) => [f, +(100 * us / b.engineTotal).toFixed(2)])) } });
  }
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
