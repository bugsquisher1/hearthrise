// tests/hunt-core/status.mjs — src/core/hunt/status.js + src/data/statuses.js (spec §3.3; parity ST-01..06). Run by run-all.mjs.
import { suite35, unit, worldOf, ctx35, steps, cut } from './fixtures/h35.js';

const bleed = (M) => M.status.statusRow('bleed');
const inst = (w) => ({ world: w, ground: null, grid: null, occ: null });
const ticks = (sc) => sc.events.filter((e) => e.type === 'status_tick');

const cases = {
  'statuses-valid': (M) => {
    const bad = M.statuses.validate();
    if (bad.length) return bad.join('; ');
    const row = bleed(M);
    const refused = (o, why) => (M.statuses.validateStatus(Object.assign({}, row, o)).length ? null : why);
    return refused({ everyMs: 1050 }, 'a tick off the sub-step grid passed')
      || refused({ tick: [3, 1] }, 'a tick range min > max passed')
      || refused({ tierPermille: [1000, 900] }, 'a tier that lowers the tick passed')
      || refused({ maxStacks: 0 }, 'zero max stacks passed');
  },
  /* ST-02 (DECIDED, week plan item 6): 5 stacks at most, whatever the sources. */
  'bleed-max-5': (M) => {
    if (bleed(M).maxStacks !== 5) return 'bleed max stacks is ' + bleed(M).maxStacks + ', the ruling is 5';
    const t = unit(M, 2, 'mon');
    const sc = ctx35(M, 1);
    const w = worldOf(M, [unit(M, 1, 'hero'), t]);
    for (let i = 0; i < 7; i++) M.status.applyStatus(inst(w), t, bleed(M), { u: 1 + (i % 2), skillLv: 0, runeTier: 1 }, sc);
    if (t.statuses.length !== 5) return 'seven applications left ' + t.statuses.length + ' stacks';
    const last = sc.events.filter((e) => e.type === 'status_on').pop();
    return last && last.stacks === 5 ? null : 'the last status_on does not report 5 stacks';
  },
  /* ST-02 + ST-04: one stack lasts 6 s, ticks once a second (6 ticks), then goes with one status_off. */
  'bleed-6s': (M) => {
    if (bleed(M).durationMs !== 6000) return 'bleed lasts ' + bleed(M).durationMs + ' ms, the ruling is 6 s';
    const t = unit(M, 2, 'mon');
    const w = worldOf(M, [unit(M, 1, 'hero'), t]);
    const sc = ctx35(M, 2);
    M.status.applyStatus(inst(w), t, bleed(M), { u: 1, skillLv: 0, runeTier: 1 }, sc);
    steps(inst(w), sc, 0, 59, M.status.tickStatuses);
    if (ticks(sc).length !== 5 || t.statuses.length !== 1) return 'before 6 s: ' + ticks(sc).length + ' ticks, ' + t.statuses.length + ' stacks';
    steps(inst(w), sc, 59, 30, M.status.tickStatuses);
    const off = sc.events.filter((e) => e.type === 'status_off');
    if (ticks(sc).length !== 6) return 'a 6 s stack ticked ' + ticks(sc).length + ' times';
    if (t.statuses.length !== 0) return 'the stack outlived 6 s';
    return off.length === 1 && off[0].atMs === 5900 ? null : 'status_off ' + JSON.stringify(off);
  },
  /* ST-01: reapplying refreshes EVERY stack of the status, so they all end together. */
  'reapply-refreshes-all': (M) => {
    const t = unit(M, 2, 'mon');
    const w = worldOf(M, [unit(M, 1, 'hero'), t]);
    const sc = ctx35(M, 3);
    const src = { u: 1, skillLv: 0, runeTier: 1 };
    M.status.applyStatus(inst(w), t, bleed(M), src, sc);
    steps(inst(w), sc, 0, 30, M.status.tickStatuses);
    M.status.applyStatus(inst(w), t, bleed(M), src, sc);
    if (!t.statuses.every((st) => st.left === 6000)) return 'after a reapply the lefts are ' + t.statuses.map((st) => st.left);
    steps(inst(w), sc, 30, 59, M.status.tickStatuses);
    if (t.statuses.length !== 2) return 'a refreshed stack expired early';
    steps(inst(w), sc, 89, 1, M.status.tickStatuses);
    return t.statuses.length === 0 ? null : 'the stacks did not end together';
  },
  /* ST-03: tick = base x (1 + Melee x 0.004) x tier (1.00/1.10/1.20), fixed when the stack lands. */
  'scales-with-melee-and-tier': (M) => {
    const S = (lv, tier) => M.status.stackScale(bleed(M), { skillLv: lv, runeTier: tier });
    const want = [[0, 1, 1000], [50, 1, 1200], [50, 3, 1440], [99, 2, 1535], [0, null, 1000]];
    for (const [lv, tier, s] of want) if (S(lv, tier) !== s) return 'scale(' + lv + ', ' + tier + ') = ' + S(lv, tier) + ', want ' + s;
    for (const bad of [[0, 4], [-1, 1], [1.5, 1]]) {
      try { S(...bad); return 'scale(' + bad + ') was accepted'; } catch { /* refused, never clamped */ }
    }
    if (M.status.tickAmount(3, 1440) !== 4 || M.status.tickAmount(1, 1000) !== 1) return 'tickAmount rounds wrong';
    const t = unit(M, 2, 'mon');
    const w = worldOf(M, [unit(M, 1, 'hero'), t]);
    const sc = ctx35(M, 4);
    M.status.applyStatus(inst(w), t, bleed(M), { u: 1, skillLv: 50, runeTier: 3 }, sc);
    steps(inst(w), sc, 0, 60, M.status.tickStatuses);
    const amts = ticks(sc).map((e) => e.amount);
    return amts.length === 6 && amts.every((a) => a >= 1 && a <= 4) && amts.some((a) => a > 3)
      ? null : 'scaled ticks are ' + amts;
  },
  /* ST-05: every tick is physical damage. */
  'bleed-is-physical': (M) => {
    const t = unit(M, 2, 'mon');
    const w = worldOf(M, [unit(M, 1, 'hero'), t]);
    const sc = ctx35(M, 5);
    M.status.applyStatus(inst(w), t, bleed(M), { u: 1, skillLv: 0, runeTier: 1 }, sc);
    steps(inst(w), sc, 0, 60, M.status.tickStatuses);
    return ticks(sc).length === 6 && ticks(sc).every((e) => e.element === 'physical') ? null : 'a tick was not physical';
  },
  /* ST-06: bleed is generic — a monster bleeds a hero. A dead unit takes nothing and drops what it had. */
  'monster-can-bleed-hero': (M) => {
    const h = unit(M, 1, 'hero');
    const w = worldOf(M, [h, unit(M, 2, 'mon')]);
    const sc = ctx35(M, 6);
    M.status.applyStatus(inst(w), h, bleed(M), { u: 2, skillLv: 0 }, sc);
    steps(inst(w), sc, 0, 20, M.status.tickStatuses);
    if (ticks(sc).length !== 2 || ticks(sc).some((e) => e.t !== 1)) return 'the hero did not bleed: ' + JSON.stringify(ticks(sc));
    /* It falls on the very sub-step its third tick is due: no tick lands on the fallen. */
    steps(inst(w), sc, 20, 20, M.status.tickStatuses, (i) => { if (i === 29) h.alive = false; });
    if (ticks(sc).length !== 2 || h.statuses.length) return 'a dead hero kept bleeding';
    if (M.status.applyStatus(inst(w), h, bleed(M), { u: 2 }, sc) !== null || h.statuses.length) return 'a dead hero took a stack';
    return sc.events.filter((e) => e.type === 'status_off').length === 1 ? null : 'death did not end the bleed once';
  },
  /* The same seed ticks the same; a stack cut mid-life at a settle boundary resumes exactly (TICK-1). */
  'stack-survives-a-cut': (M) => {
    const run = (cutAt) => {
      const t = unit(M, 2, 'mon');
      let w = worldOf(M, [unit(M, 1, 'hero'), t]);
      const sc = ctx35(M, 7);
      const apply = (i) => {
        if (i % 7 === 0 && i < 50) M.status.applyStatus(inst(w), w.units[1], bleed(M), { u: 1, skillLv: 20, runeTier: 2 }, sc);
      };
      for (let i = 0; i < 120; i++) {
        if (cutAt.includes(i)) w = cut(M, w);
        steps(inst(w), sc, i, 1, M.status.tickStatuses, apply);
      }
      return JSON.stringify(sc.events);
    };
    const one = run([]);
    if (!/status_tick/.test(one)) return 'the fixture never ticked';
    return run([13, 31, 58, 77]) === one ? null : 'a cut changed the bleed';
  },
};

const mutants = [
  { name: 'reapply refreshes only the new stack', case: 'reapply-refreshes-all',
    edits: [['src/core/hunt/status.js', '  for (const st of list) if (st.s === row.id) st.left = row.durationMs;\n', '']] },
  { name: 'a sixth stack lands', case: 'bleed-max-5',
    edits: [['src/core/hunt/status.js', 'if (before < row.maxStacks) {', 'if (before <= row.maxStacks) {']] },
  { name: 'the tick at expiry is lost', case: 'bleed-6s',
    edits: [['src/core/hunt/status.js', 'if (st.next > 0 || st.left < 0) continue;', 'if (st.next > 0 || st.left <= 0) continue;']] },
  { name: 'the rune tier does not scale', case: 'scales-with-melee-and-tier',
    edits: [['src/core/hunt/status.js', ' * row.tierPermille[tier - 1]) / 1000);', ' * 1000) / 1000);']] },
  { name: 'the ruling drifts to 6 stacks', case: 'bleed-max-5',
    edits: [['src/data/statuses.js', 'durationMs: 6000, maxStacks: 5,', 'durationMs: 6000, maxStacks: 6,']] },
  { name: 'bleed deals fire', case: 'bleed-is-physical',
    edits: [['src/data/statuses.js', "damageType: 'physical',", "damageType: 'fire',"]] },
  { name: 'stacks are not persisted', case: 'stack-survives-a-cut',
    edits: [['src/core/hunt/status.js', "unit: Object.freeze([['statuses', 'json']])", 'unit: Object.freeze([])']] },
  { name: 'a dead unit keeps bleeding', case: 'monster-can-bleed-hero',
    edits: [['src/core/hunt/status.js', "if (unit.alive !== true) { dropAll(unit, sc); continue; }\n    for", 'for']] },
];

await suite35('hunt-core/status', cases, mutants);
