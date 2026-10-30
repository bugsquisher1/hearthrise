// tests/hunt-core/world-step.mjs — src/core/hunt/world-step.js inside src/core/combat-sim.js's one loop over a hunt INSTANCE
// (engine contract #1-#5; parity WS-02..06, TICK-1, AWAY-1). Run by run-all.mjs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, spanFixture, runSpan, member, T0, world, hero, groundRow, gridOf } from './fixtures/h1.js';

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
      M.worldstep.stepSwing(w, { ground: groundRow(), grid: gridOf(M), swingMs: 2050, atMs: 0 });
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
  /* DEATH ENDS THE HUNT (Tyler 2026-10-19): the killed hero's death is priced at once, its hunt ends `died`
     at its next boundary, it walks home with FULL HP, and an instance with no member left stops stepping. */
  'death-ends-the-hunt': (M) => {
    const fx = spanFixture(M, 7, { spanMs: 100000, members: [member(M, 'a', { unitId: 1, hp: 3, maxHp: 3, acc: 50, maxHit: 1, levelXp: 20000 })] });
    runSpan(M, fx, []);
    const m = fx.inst.members[0];
    if (m.hs.endedReason !== 'died') return 'the hunt did not end `died` (ended ' + m.hs.endedReason + ')';
    if (m.hs.tally.deaths !== 1) return 'deaths ' + m.hs.tally.deaths + ', want exactly 1';
    if (m.state.playerHp !== m.state.playerMaxHp) return 'the dead hero came home at ' + m.state.playerHp + ' of ' + m.state.playerMaxHp + ' HP, not full';
    if (!(m.state.levelXp < 20000)) return 'the death cost no Level XP';
    if (m.hs.endedAtMs % 2000 !== 0 || m.hs.endedAtMs <= T0) return 'the end is not on a swing boundary: ' + m.hs.endedAtMs;
    return fx.world.swing < 50 ? null : 'the world kept stepping all 50 boundaries after its only hero died';
  },
  /* EVERY END SENDS THE HERO HOME WHOLE (designer 2026-10-29: Pellow left at 135/160 and started his next hunt
     there). A hero that walks in at 60 of 400 HP and ends by a leave, stamina, supplies (heals_out), gold (gold_out)
     or a stop rule is back with FULL HP, as a dead one is; in one span (the browser closed: the tick's long
     window) and cut anywhere (the hunt viewed: a player's instants). Each end is the engine's own (a real eat,
     a store buy the purse cannot pay, a rule met), never a planted flag; no food heals it on the way (an empty bag). */
  'every-end-goes-home-whole': (M) => {
    const eat = (id) => M.conditions.heroSlots([{ action: { type: 'consume', id }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 99 }], join: 'and' }], 'melee_dps');
    const salted = M.SB.BASIC_SUPPLIES.find((b) => b.id === 'salted_shrimp');
    const ENDS = {
      left: { hs: { leaveAtMs: T0 + 6000 } },
      stamina: { hs: { staminaMs: 3 * 2000 } },
      heals_out: { hs: { onEmpty: 'end', bag: { cooked_shrimp: { loaded: 1, essential: true } } } },
      gold_out: { hs: { purse: 0, basics: { salted_shrimp: { kind: 'heal', price: salted.price, heals: salted.heals, partner: salted.partner } } },
        slots: eat('salted_shrimp') },
      rule: { stop: M.conditions.heroStopRules([{ conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 99 }], join: 'and', forMs: 0 }]) },
    };
    for (const [why, e] of Object.entries(ENDS)) {
      for (const [path, cuts] of [['the browser closed', []], ['the hunt viewed', cutsOf(11, 6, 30000)]]) {
        const a = member(M, 'a', { unitId: 1, hp: 60, maxHp: 400 });
        a.hs = M.AR.newHuntSession(Object.assign({ id: 'h1-a', instanceId: 'h1-span', huntFromMs: T0, nextSwingAtMs: T0, bag: {} }, e.hs));
        /* The bar: its one food slot (an own stack, so an empty bag never fires it), or the case's. */
        a.hero.slots = e.slots || eat('cooked_shrimp');
        if (e.stop) a.hero.stopRules = e.stop;
        const fx = spanFixture(M, 7, { spanMs: 30000, members: [a] });
        fx.inst.world.units.find((u) => u.id === 1).hp = 60;
        runSpan(M, fx, cuts);
        if (a.hs.endedReason !== why) return why + ' (' + path + '): the hunt ended ' + a.hs.endedReason;
        if (a.state.playerHp !== a.state.playerMaxHp) return why + ' (' + path + '): the hero came home at ' + a.state.playerHp + ' of ' + a.state.playerMaxHp + ' HP, not full';
      }
    }
    return null;
  },
  /* AN END IS WHERE IT IS, HOWEVER THE WINDOWS FALL (TICK-1, BOTH-PATH): a window cut just after the death
     (its end stamped after the loop) and one span (its end met at the boundary) leave the instance on the same
     swing and clock: the world is never stepped once more after its last member ended. */
  'death-split-parity': (M) => {
    const mk = () => spanFixture(M, 7, { spanMs: 100000, members: [member(M, 'a', { unitId: 1, hp: 3, maxHp: 3, acc: 50, maxHit: 1, levelXp: 20000 })] });
    const one = runSpan(M, mk(), []);
    const death = JSON.parse(one).memberEvents.find((e) => e.type === 'death');
    if (!death) return 'the fixture hero never died: the case would prove nothing';
    for (const d of [100, 1500, 1900]) {
      if (runSpan(M, mk(), [death.atMs + d]) !== one) return 'a window cut ' + d + ' ms after the death left the instance elsewhere than one span did';
    }
    return null;
  },
  /* A DEATH SENDS THE TICKED PARTY HOME (Tyler 2026-10-22, "Leave if anyone leaves the hunt or dies", default on): the
     survivor ends `party_member_died` at its boundary and pays nothing. */
  'party-death-ends-everyone': (M) => {
    const fx = spanFixture(M, 7, { spanMs: 100000, members: [member(M, 'a', { unitId: 1, seat: 0, hp: 3, maxHp: 3, acc: 50, maxHit: 1, levelXp: 20000 }),
      member(M, 'b', { unitId: 2, seat: 1, hp: 5000, maxHp: 5000, levelXp: 20000, together: true })] });
    runSpan(M, fx, []);
    const [a, b] = fx.inst.members;
    if (a.hs.endedReason !== 'died') return 'the weak hero ended ' + a.hs.endedReason;
    if (b.hs.endedReason !== 'party_member_died') return 'the survivor ended ' + b.hs.endedReason + ', not party_member_died';
    if (b.state.levelXp < 20000 || b.hs.tally.deaths !== 0) return 'the survivor paid for a death it did not have';
    return a.hs.endedAtMs === b.hs.endedAtMs ? null : 'the two ends are not on the same boundary: ' + a.hs.endedAtMs + ' / ' + b.hs.endedAtMs;
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
  { name: 'a death does not end the hunt', case: 'death-ends-the-hunt',
    edits: [['src/core/action-rules.js', '  died: (hs) => hs.died === true,', '  died: () => false,']] },
  { name: 'a dead hero comes home at 0 HP', case: 'death-ends-the-hunt',
    edits: [['src/core/combat-sim.js', '  m.state.playerHp = m.state.playerMaxHp;\n', '']] },
  /* The pre-2026-10-29 end, restored: only a death sent the hero home whole. */
  { name: 'an end other than a death walks home with the HP it had', case: 'every-end-goes-home-whole',
    edits: [['src/core/combat-sim.js', '  m.state.playerHp = m.state.playerMaxHp;\n',
      '  const u = world && m.unitId !== null ? world.units.find((x) => x.id === m.unitId) : null;\n  if (u) m.state.playerHp = u.alive ? u.hp : m.state.playerMaxHp;\n']] },
  { name: 'a death costs no XP', case: 'death-ends-the-hunt',
    edits: [['src/core/combat-sim.js', "    if (k === 'level') m.state.levelXp = (Number(m.state.levelXp) || 0) - xpLost[k];", "    if (k === 'level') m.state.levelXp = Number(m.state.levelXp) || 0;"]] },
  { name: 'a party death leaves the survivor hunting', case: 'party-death-ends-everyone',
    edits: [['src/core/combat-sim.js', "    if (o.hero && o.hero.leaveTogether === true) o.hs.partyEnd = why === 'died' ? 'died' : 'left';",
      "    if (o.hero && o.hero.leaveTogether === true && why !== 'died') o.hs.partyEnd = 'left';"]] },
  { name: 'the swing seed is indexed per window', case: 'split-parity',
    edits: [['src/core/combat-sim.js', "rng: createRng(seedOf(ctx, 's', sw))", "rng: createRng(seedOf(ctx, 's', swings))"]] },
  { name: 'the world steps once more after its last member ended', case: 'death-split-parity',
    edits: [['src/core/combat-sim.js', '    if (!members.some((m) => !m.left) && atMs > startMs) break;\n', '']] },
  { name: 'a sub-step that is not a whole number', case: 'substeps-divide-swing',
    edits: [['src/core/hunt/world-step.js', ' || swingMs % s !== 0) {', ') {']] },
];

await suite('hunt-core/world-step', cases, mutants);
