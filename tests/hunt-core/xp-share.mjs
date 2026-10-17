// tests/hunt-core/xp-share.mjs — src/core/hunt/xp-share.js + src/data/hunt-xp.js (spec §3.5; parity XP-01..05, XP-07, AB-04).
// Both paths (CLAUDE.md §4): ATTENDED (the viewed character's settle cadence: the instance span cut into
// 2 s windows) and AWAY (one long window, ctx.away set) pay kill XP through the one rule, through
// src/core/hunt-rewards.js — a solo hunt is a party of one, and there is no second path. Run by run-all.mjs.
import { suite35, unit, worldOf, ctx35, steps, cut } from './fixtures/h35.js';
import { spanFixture, runSpan, member, T0 } from './fixtures/h1.js';

const inst = (w) => ({ world: w, ground: null, grid: null, occ: null });
const ofType = (sc, t) => sc.events.filter((e) => e.type === t);

/* Kill XP actually credited, per path: the total fx.addXp at multiplier 2 minus at 1 is exactly the kill XP
   at 1 (hit XP and every die are the same; the multiplier draws nothing). Answers { killXp, monsterXp, kills }. */
function creditedKillXp(M, run) {
  const at = (mult) => {
    let xp = 0; let monsterXp = 0; let kills = 0;
    /* Summed in integer milli-XP: hit XP is fractional (HP XP per damage), and a float sum's
       difference is not exact (33.00000000000006). Kill XP is whole, so the rule stays exact. */
    const fx = { addXp: (sk, n) => { xp += Math.round(n * 1000); },
      updateQuest: (type, n, meta) => { if (type === 'kill_monster') { kills++; monsterXp += M.MONSTERS[meta.target].xp; } } };
    run(fx, () => mult);
    return { xp, monsterXp, kills };
  };
  const one = at(1); const two = at(2);
  if (one.kills !== two.kills || one.monsterXp !== two.monsterXp) throw new Error('the multiplier changed the fight');
  return { killXp: (two.xp - one.xp) / 1000, monsterXp: one.monsterXp, kills: one.kills };
}

/* A SOLO hero on the h1 ground (a party of one, so a kill's share is the whole kill and the rule is exact). */
const solo = (M, fx, xpMultOf) => spanFixture(M, 11, { spanMs: 120000, xpMultOf,
  members: [member(M, 'a', { unitId: 1, hp: 100000, maxHp: 100000, fx })] });

/* ATTENDED: the viewed character's cadence — the span cut into 2 s windows. */
function attended(M, fx, xpMultOf) {
  runSpan(M, solo(M, fx, xpMultOf), Array.from({ length: 59 }, (_, i) => T0 + (i + 1) * 2000));
}

/* AWAY: the same hunt as one window. */
function away(M, fx, xpMultOf, awayFlag) {
  const f = solo(M, fx, xpMultOf);
  f.ctx.away = awayFlag !== false;
  runSpan(M, f, []);
}

const cases = {
  'hunt-xp-valid': (M) => {
    const bad = M.huntxp.validate();
    if (bad.length) return bad.join('; ');
    return M.huntxp.HUNT_XP.groupMs === 1000 ? null : 'the +XP window is ' + M.huntxp.HUNT_XP.groupMs + ' ms, the ruling is 1 s';
  },
  /* XP-01: the base share is the monster's XP over the heroes ALIVE at the kill. */
  'share-split-by-living': (M) => {
    const w = worldOf(M, [unit(M, 1, 'hero'), unit(M, 2, 'hero'), unit(M, 3, 'hero', { alive: false }), unit(M, 9, 'mon')]);
    const sc = ctx35(M, 1);
    const paid = M.xpshare.shareKillXp(inst(w), { t: 9, u: 1, xp: 10 }, sc);
    if (JSON.stringify(paid) !== '{"1":5,"2":5}') return 'two living of three paid ' + JSON.stringify(paid);
    w.units[2].alive = true;
    const three = M.xpshare.shareKillXp(inst(w), { t: 9, u: 1, xp: 10 }, sc);
    if (JSON.stringify(three) !== '{"1":3,"2":3,"3":3}') return 'three living paid ' + JSON.stringify(three);
    w.units.forEach((u) => { if (u.side === 'hero') u.alive = false; });
    return Object.keys(M.xpshare.shareKillXp(inst(w), { t: 9, u: 1, xp: 10 }, sc)).length ? 'a wiped party was paid' : null;
  },
  /* XP-02 / XP-07: each hero's XP is the base share times ITS OWN multiplier (the injected hook; absent = 1). */
  'each-hero-own-multiplier': (M) => {
    const w = worldOf(M, [unit(M, 1, 'hero'), unit(M, 2, 'hero'), unit(M, 9, 'mon')]);
    const sc = ctx35(M, 2, { xpMultOf: (h) => (h.id === 1 ? 2 : 1) });
    const paid = M.xpshare.shareKillXp(inst(w), { t: 9, u: 1, xp: 10 }, sc);
    if (paid[1] !== 10 || paid[2] !== 5) return 'multipliers 2 and 1 paid ' + JSON.stringify(paid);
    const xp = ofType(sc, 'xp');
    if (xp.length !== 2 || xp.some((e) => e.raw !== 5)) return 'raw XP must be the share before the multiplier: ' + JSON.stringify(xp);
    const plain = ctx35(M, 2);
    if (JSON.stringify(M.xpshare.shareKillXp(inst(w), { t: 9, xp: 10 }, plain)) !== '{"1":5,"2":5}') return 'with no hook the multiplier is not 1';
    for (const bad of [NaN, -1, '2']) {
      try { M.xpshare.shareKillXp(inst(w), { t: 9, xp: 10 }, ctx35(M, 2, { xpMultOf: () => bad })); return 'multiplier ' + bad + ' was accepted'; } catch { /* refused */ }
    }
    return null;
  },
  /* XP-03: kills within 1 s of the first are ONE "+XP" number, per hero, at the kills' centre. */
  'group-window-1s': (M) => {
    const w = worldOf(M, [unit(M, 1, 'hero'), unit(M, 2, 'hero'), unit(M, 8, 'mon', { x: 4, y: 2 }), unit(M, 9, 'mon', { x: 6, y: 4 })]);
    const sc = ctx35(M, 3, { xpMultOf: (h) => (h.id === 2 ? 2 : 1) });
    const killAt = { 0: 8, 5: 9, 9: 8, 10: 9 };
    steps(inst(w), sc, 0, 30, M.xpshare.flushXpGroup, (i) => {
      if (killAt[i]) M.xpshare.shareKillXp(inst(w), { t: killAt[i], u: 1, xp: 20 }, sc);
    });
    const g = ofType(sc, 'xp_group');
    if (g.length !== 2) return 'kills at 0, 0.5, 0.9 and 1.0 s gave ' + g.length + ' groups';
    const [a, b] = g;
    if (a.atMs !== 1000 || a.kills !== 3 || a.amount !== 90 || a.by[1] !== 30 || a.by[2] !== 60) return 'first group ' + JSON.stringify(a);
    if (Math.abs(a.x - 14 / 3) > 1e-9 || Math.abs(a.y - 8 / 3) > 1e-9) return 'first group centre ' + a.x + ',' + a.y;
    return b.atMs === 2000 && b.kills === 1 && b.x === 6 && b.y === 4 ? null : 'second group ' + JSON.stringify(b);
  },
  /* The open group rides the world across a settle cut (TICK-1). */
  'group-survives-a-cut': (M) => {
    const run = (cuts) => {
      let w = worldOf(M, [unit(M, 1, 'hero'), unit(M, 9, 'mon')]);
      const sc = ctx35(M, 4);
      for (let i = 0; i < 40; i++) {
        if (cuts.includes(i)) w = cut(M, w);
        steps(inst(w), sc, i, 1, M.xpshare.flushXpGroup, (j) => { if (j % 6 === 0) M.xpshare.shareKillXp(inst(w), { t: 9, u: 1, xp: 7 }, sc); });
      }
      return JSON.stringify(sc.events);
    };
    const one = run([]);
    if (!/xp_group/.test(one)) return 'the fixture never grouped';
    return run([3, 8, 15, 27]) === one ? null : 'a cut changed the +XP groups';
  },
  /* XP-05: a level event per level crossed, on the one curve (src/core/xp.js). */
  'level-event': (M) => {
    const t = M.xpcurve.xpForLevel;
    const evs = M.xpshare.levelUps(1, 'attack', t(2) - 1, t(4) - t(2) + 1, 500);
    if (evs.map((e) => e.level).join() !== '2,3,4' || evs.some((e) => e.atMs !== 500 || e.u !== 1)) return 'levels ' + JSON.stringify(evs);
    return M.xpshare.levelUps(1, 'attack', t(5), 1, 0).length ? 'one XP past a threshold levelled' : null;
  },
  /* AB-04: Magic XP = mana x 1.5 x the ability's multiplier. */
  'magic-xp-from-mana': (M) => {
    const f = M.xpshare.magicXpFor;
    return f(10) === 15 && f(10, 2) === 30 && f(0) === 0 && f(3) === 4 ? null : 'magic XP ' + [f(10), f(10, 2), f(0), f(3)];
  },
  /* ATTENDED: the 2 s cadence's kill XP is the one rule's (the multiplier reaches it, solo = a party of one). */
  'attended-kill-xp-through-the-rule': (M) => {
    const r = creditedKillXp(M, (fx, mult) => attended(M, fx, mult));
    if (r.kills < 3) return 'the attended fixture killed ' + r.kills;
    return r.killXp === r.monsterXp ? null : 'attended kill XP at x2 rose by ' + r.killXp + ', the kills were worth ' + r.monsterXp;
  },
  /* AWAY: the same rule on the span, and away equals attended (AWAY-1). */
  'away-kill-xp-through-the-rule': (M) => {
    const r = creditedKillXp(M, (fx, mult) => away(M, fx, mult));
    if (r.kills < 2) return 'the away fixture killed ' + r.kills;
    if (r.killXp !== r.monsterXp) return 'away kill XP at x2 rose by ' + r.killXp + ', the kills were worth ' + r.monsterXp;
    const tot = (flag) => { let xp = 0; away(M, { addXp: (s, n) => { xp += n; } }, () => 1, flag); return xp; };
    return tot(true) === tot(false) ? null : 'ctx.away changed the XP';
  },
};

const mutants = [
  { name: 'the dead share the kill', case: 'share-split-by-living',
    edits: [['src/core/hunt/xp-share.js', "units.filter((u) => u.side === 'hero' && u.alive === true)", "units.filter((u) => u.side === 'hero')"]] },
  { name: 'the multiplier is ignored', case: 'each-hero-own-multiplier',
    edits: [['src/core/hunt/xp-share.js', 'xp: Math.floor(raw * multOf(sc, h) + 1e-9)', 'xp: Math.floor(raw * (multOf(sc, h) ? 1 : 1) + 1e-9)']] },
  { name: 'the +XP group closes at once', case: 'group-window-1s',
    edits: [['src/core/hunt/xp-share.js', 'sc.atMs < g.at + HUNT_XP.groupMs', 'sc.atMs < g.at']] },
  { name: 'the open group is not persisted', case: 'group-survives-a-cut',
    edits: [['src/core/hunt/xp-share.js', "world: Object.freeze([['xpGroup', 'json']])", 'world: Object.freeze([])']] },
  { name: 'the attended kill bypasses the rule', case: 'attended-kill-xp-through-the-rule',
    edits: [['src/core/hunt-rewards.js', 'for (const g of killXpRoute(m.style, ev.amount, 1))', 'for (const g of killXpRoute(m.style, ev.raw, 1))']] },
  { name: 'the away kill bypasses the rule', case: 'away-kill-xp-through-the-rule',
    edits: [['src/core/hunt-rewards.js', 'for (const g of killXpRoute(m.style, ev.amount, 1))', 'for (const g of killXpRoute(m.style, ev.raw, 1))']] },
  { name: 'Magic XP drifts off 1.5', case: 'magic-xp-from-mana',
    edits: [['src/data/hunt-xp.js', 'magicXpPermillePerMana: 1500,', 'magicXpPermillePerMana: 1000,']] },
];

await suite35('hunt-core/xp-share', cases, mutants);
