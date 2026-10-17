// tests/hunt-core/world-step.mjs — src/core/hunt/world-step.js inside src/core/combat-sim.js's one loop
// (engine contract #1-#5; parity WS-02..06, TICK-1, AWAY-1). Run by run-all.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, spanFixture, runSpan, T0, world, hero, groundRow, gridOf } from './fixtures/h1.js';

/* Cut instants from a fixed LCG: arbitrary ms, never chosen to land on a boundary. */
function cutsOf(seed, n, spanMs) {
  let s = seed >>> 0; const out = [];
  for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; out.push(T0 + 1 + (s % (spanMs - 2))); }
  return out;
}

const cases = {
  'substeps-divide-swing': (M) => {
    if (M.worldstep.substepsOf(2000) !== 20) return '2000 ms should be 20 sub-steps';
    for (const bad of [2050, 0, -100, 1999.5]) {
      try { M.worldstep.substepsOf(bad); return bad + ' ms was accepted'; } catch { /* refused, as it must be */ }
    }
    const w = world(M, [hero(M, 1, 5, 8)]);
    try {
      M.worldstep.stepSwing(w, { ground: groundRow(), grid: gridOf(M), swingMs: 2050, atMs: 0, fight: false });
      return 'a world stepped a 2050 ms swing';
    } catch { return null; }
  },
  /* TICK-1 with a world: N windows cut anywhere, the world JSON-decoded at every cut, equal one span. */
  'split-parity': (M) => {
    const one = runSpan(M, spanFixture(M, 7), []);
    if (!/"track":\[\{/.test(one)) return 'the fixture moved nothing — the test would prove nothing';
    for (const seed of [1, 2, 3]) {
      const cut = runSpan(M, spanFixture(M, 7), cutsOf(seed, 9, 60000));
      if (cut !== one) return 'cut set ' + seed + ' differs from the one span';
    }
    const ten = runSpan(M, spanFixture(M, 7), Array.from({ length: 5 }, (_, i) => T0 + (i + 1) * 10000));
    return ten === one ? null : 'ten-second windows differ from the one span';
  },
  /* The instance never pauses for one hero: knocked out or waiting on a pull, the world still steps. */
  'world-steps-every-boundary': (M) => {
    const fx = spanFixture(M, 7);
    runSpan(M, fx, []);
    const hs = fx.state.huntSession;
    if (!(hs.tally.waitMs > 0)) return 'the fixture never waits on a pull — the test would prove nothing';
    return hs.world.swing === hs.swingIndex ? null : 'the world stepped ' + hs.world.swing + ' of ' + hs.swingIndex + ' boundaries';
  },
  /* AWAY-1: there is no away path — the flag changes nothing. */
  'attended-equals-away': (M) => {
    const a = spanFixture(M, 7); a.ctx.away = false;
    const b = spanFixture(M, 7); b.ctx.away = true;
    return runSpan(M, a, []) === runSpan(M, b, []) ? null : 'ctx.away changed the hunt';
  },
  'deterministic-same-seed': (M) => {
    const x = runSpan(M, spanFixture(M, 7), []);
    if (runSpan(M, spanFixture(M, 7), []) !== x) return 'the same seed gave two hunts';
    if (runSpan(M, spanFixture(M, 8), []) === x) return 'another seed gave the same hunt — the dice are not reaching the swing';
    return null;
  },
  /* WS-02: the sub-step order is stated once, in this order. */
  'step-order': (M) => {
    const src = readFileSync(join(M.root, 'src/core/hunt/world-step.js'), 'utf8');
    const block = src.slice(src.indexOf('const SUBSTEP = Object.freeze(['), src.indexOf(']);', src.indexOf('const SUBSTEP')));
    const order = ['recordTrail', 'respawnPacks', 'runPhase', 'chooseTargets', 'positionHeroes', 'followTrail', 'moveAll',
      'resetPack', 'resolveAttacks', 'castAbilities', 'tickStatuses', 'consume', 'clearCorpses'];
    const at = order.map((n) => block.indexOf(n));
    if (at.some((i) => i < 0)) return 'missing from the sub-step list: ' + order.filter((n, i) => at[i] < 0).join(', ');
    for (let i = 1; i < at.length; i++) if (at[i] < at[i - 1]) return order[i] + ' runs before ' + order[i - 1];
    return null;
  },
};

const mutants = [
  { name: 'encode drops a field (prog)', case: 'split-parity',
    edits: [['src/core/hunt/world-state.js', 'const row = (part, obj) => FIELDS[part].map(([name]) => copy(obj[name]));',
      "const row = (part, obj) => FIELDS[part].map(([name]) => (name === 'prog' ? 0 : copy(obj[name])));"]] },
  { name: 'the world sleeps while the hero is down or waiting', case: 'world-steps-every-boundary',
    edits: [['src/core/combat-sim.js', '  const worldOnly = (atMs, swing) => { if (hs.world)', '  const worldOnly = (atMs, swing) => { if (false)']] },
  { name: 'the swing seed is indexed per window', case: 'split-parity',
    edits: [['src/core/combat-sim.js', 'rng: createRng(swingSeedOf(ctx, swing)) });', 'rng: createRng(swingSeedOf(ctx, ticks)) });']] },
  { name: 'a sub-step that is not a whole number', case: 'substeps-divide-swing',
    edits: [['src/core/hunt/world-step.js', ' || swingMs % s !== 0) {', ') {']] },
];

await suite('hunt-core/world-step', cases, mutants);
