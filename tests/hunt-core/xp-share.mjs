// tests/hunt-core/xp-share.mjs — src/core/hunt/xp-share.js + src/data/hunt-xp.js (spec §3.5; parity XP-01..05, XP-07, AB-04).
// Both paths (CLAUDE.md §4): ATTENDED (the viewed character's settle cadence: the instance span cut into
// 2 s windows) and AWAY (one long window, ctx.away set) pay kill XP through the one rule, through
// src/core/hunt-rewards.js — a solo hunt is a party of one, and there is no second path. Run by run-all.mjs.
import { suite35, unit, worldOf, ctx35, steps, cut } from './fixtures/h35.js';
import { spanFixture, runSpan, member, T0 } from './fixtures/h1.js';

const inst = (w) => ({ world: w, ground: null, grid: null, occ: null });
const ofType = (sc, t) => sc.events.filter((e) => e.type === t);

/* Kill XP actually credited, per path: the total fx.addLevelXp at multiplier 2 minus at 1 is exactly the kill XP
   at 1 (every die is the same; the multiplier draws nothing). Kill XP is the character's LEVEL only
   (CORE_MODEL.md §4). Answers { killXp, monsterXp, kills }. */
function creditedKillXp(M, run) {
  const at = (mult) => {
    let xp = 0; let monsterXp = 0; let kills = 0;
    /* Summed in integer milli-XP: hit XP is fractional (HP XP per damage), and a float sum's
       difference is not exact (33.00000000000006). Kill XP is whole, so the rule stays exact. */
    const fx = { addLevelXp: (n) => { xp += Math.round(n * 1000); },
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

/* THE DESIGNER'S TABLE (2026-11-01): ground -> heroes alive -> permille by distinct classes (1, 2, ...). */
const PARTY_TABLE = {
  mill_cellar: { 2: [1000, 1210], 3: [990, 1120, 1180], 4: [1000, 1250, 1270, 1400] },
  meadowbrook_thicket: { 2: [930, 1290], 3: [880, 1180, 1310], 4: [940, 1100, 1150, 1180] },
  wickstead: { 2: [880, 1070], 3: [970, 1160, 1270], 4: [970, 1200, 1240, 1270] },
  mosslight_glade: { 2: [960, 1180], 3: [1000, 1300, 1400], 4: [1000, 1200, 1290, 1320] },
  millrace_sewer: { 2: [800, 1100], 3: [800, 1050, 1100], 4: [800, 1050, 1100, 1180] },
  coppercap_warrens: { 2: [960, 1180], 3: [970, 1200, 1280], 4: [960, 1200, 1260, 1360] },
};
/* A kill big enough that every cell lands whole (no floor hides a cell), divisible by 2, 3, 4 and 5. */
const BIG = 600000;
const CLASS_ROLES = ['tank', 'ranger', 'mage', 'healer'];
/* `n` heroes holding exactly `k` classes: one of each, the rest Melee (a tank and a sword alone in turn, one class). */
const rolesFor = (n, k) => Array.from({ length: n }, (_, i) => (i < k ? CLASS_ROLES[i] : i % 2 ? 'melee_dps' : 'tank'));
const rootUrl = (M) => 'file:///' + M.root.replace(/\\/g, '/') + '/';
const pc = (M) => import(new URL('src/data/party-class-xp.js', rootUrl(M)).href + M.V);
/* One kill of `xp` on ground `id` by living heroes of `roles` (unit ids 1, 2, ...): { [unit id]: XP }. */
function killOn(M, id, roles, xp) {
  const w = worldOf(M, [...roles.map((role, i) => unit(M, i + 1, 'hero', { role })), unit(M, 99, 'mon')]);
  return M.xpshare.shareKillXp({ world: w, ground: { id }, grid: null, occ: null }, { t: 99, u: 1, xp }, ctx35(M, 5));
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
  /* THE PARTY FACTOR (Tyler 2026-10-31; designer's table): every cell, on every row, heroes alive by distinct classes.
     The table is typed here on purpose: a retune is a data row AND this pin, moved together. */
  'party-class-every-cell': async (M) => {
    for (const [ground, sizes] of Object.entries(PARTY_TABLE)) {
      for (const [n, cells] of Object.entries(sizes)) {
        for (let k = 1; k <= cells.length; k++) {
          const roles = rolesFor(Number(n), k);
          const paid = killOn(M, ground, roles, BIG);
          const want = Math.floor(BIG / Number(n) * cells[k - 1] / 1000 + 1e-9);
          if (Object.values(paid).length !== Number(n) || Object.values(paid).some((v) => v !== want)) {
            return ground + ', ' + n + ' heroes of ' + k + ' classes (' + roles + ') paid ' + JSON.stringify(paid) + ', want ' + want + ' each';
          }
        }
      }
    }
    const { PARTY_CLASS_XP, validate } = await pc(M);
    const { HUNT_GROUNDS } = await import(new URL('src/data/hunt-grounds.js', rootUrl(M)).href + M.V);
    const named = Object.keys(PARTY_CLASS_XP).sort().join();
    if (named !== Object.keys(PARTY_TABLE).sort().join()) return 'the table has rows for ' + named;
    const bad = validate(Object.values(HUNT_GROUNDS).map((g) => g.id));
    return bad.length ? bad.join('; ') : null;
  },
  /* A shield Melee and a Melee are ONE class, whichever shares the party; a Melee beside a Ranger is two. */
  'party-class-melee-is-one': (M) => {
    const one = killOn(M, 'meadowbrook_thicket', ['tank', 'melee_dps'], BIG);
    const cell = PARTY_TABLE.meadowbrook_thicket[2][0];   // the Thicket's one-class duo cell, read from the table (930 since lane/b-ground-formula-2)
    if (Object.values(one).some((v) => v !== Math.round((BIG / 2) * cell / 1000))) return 'tank + melee_dps paid ' + JSON.stringify(one) + ', the one-class cell is ' + cell;
    const four = killOn(M, 'mosslight_glade', ['tank', 'tank', 'melee_dps', 'melee_dps'], BIG);
    if (Object.values(four).some((v) => v !== BIG / 4)) return 'four Melee paid ' + JSON.stringify(four);
    const sewer = killOn(M, 'millrace_sewer', ['tank', 'melee_dps'], BIG);
    if (Object.values(sewer).some((v) => v !== Math.round((BIG / 2) * 0.8))) return 'tank + melee_dps in the Sewer paid ' + JSON.stringify(sewer);
    const two = killOn(M, 'meadowbrook_thicket', ['tank', 'ranger'], BIG);
    return Object.values(two).every((v) => v === Math.round((BIG / 2) * 1.29)) ? null : 'CONTROL: a Melee and a Ranger paid ' + JSON.stringify(two);
  },
  /* READ AT EACH KILL, NO LATCH: a death changes the mix on the NEXT kill, a leave too, and the last hero standing is the identity. */
  'party-class-death-changes-next-kill': (M) => {
    const heroes = ['tank', 'ranger', 'mage', 'healer'].map((role, i) => unit(M, i + 1, 'hero', { role }));
    const w = worldOf(M, [...heroes, unit(M, 9, 'mon')]);
    const at = { world: w, ground: { id: 'mill_cellar' }, grid: null, occ: null };
    const kill = () => M.xpshare.shareKillXp(at, { t: 9, u: 1, xp: BIG }, ctx35(M, 7));
    const each = (o) => [...new Set(Object.values(o))];
    let got = each(kill());
    if (got.join() !== String(Math.round((BIG / 4) * 1.4))) return 'four classes alive paid ' + got;
    heroes[1].alive = false;   // the Ranger dies: three heroes of three classes
    got = each(kill());
    if (got.join() !== String(Math.round((BIG / 3) * 1.18))) return 'after the Ranger died three classes paid ' + got;
    heroes[0].alive = false;   // the Melee dies: two heroes of two classes
    got = each(kill());
    if (got.join() !== String(Math.round((BIG / 2) * 1.21))) return 'after the Melee died two classes paid ' + got;
    w.units = w.units.filter((u) => u !== heroes[2]);   // the Mage leaves: a hero alone
    got = each(kill());
    if (got.join() !== String(BIG)) return 'the last hero standing paid ' + got;
    /* A death that loses no class still moves the cell: tank + tank + ranger (3 of 2) down to tank + ranger (2 of 2). */
    const t = [unit(M, 1, 'hero', { role: 'tank' }), unit(M, 2, 'hero', { role: 'tank' }), unit(M, 3, 'hero', { role: 'ranger' })];
    const w2 = worldOf(M, [...t, unit(M, 9, 'mon')]);
    const at2 = { world: w2, ground: { id: 'wickstead' }, grid: null, occ: null };
    got = each(M.xpshare.shareKillXp(at2, { t: 9, u: 1, xp: BIG }, ctx35(M, 7)));
    if (got.join() !== String(Math.round((BIG / 3) * 1.16))) return 'three heroes of two classes paid ' + got;
    t[1].alive = false;
    got = each(M.xpshare.shareKillXp(at2, { t: 9, u: 1, xp: BIG }, ctx35(M, 7)));
    return got.join() === String(Math.round((BIG / 2) * 1.07)) ? null : 'two heroes of two classes paid ' + got;
  },
  /* THE DEFAULT: a ground with no row pays the even share, mixed or not, and a hero alone is the identity everywhere. */
  'party-class-no-row-is-even': (M) => {
    const mixed = killOn(M, 'a_ground_with_no_row', ['tank', 'ranger', 'mage', 'healer'], BIG);
    if (Object.values(mixed).some((v) => v !== BIG / 4)) return 'a ground with no row paid ' + JSON.stringify(mixed);
    for (const g of Object.keys(PARTY_TABLE)) {
      const solo = killOn(M, g, ['healer'], BIG);
      if (solo[1] !== BIG) return g + ': a hero alone paid ' + solo[1];
    }
    /* A party past the table's largest size keeps its cut and its top cell (the party cap is a config value). */
    const five = killOn(M, 'millrace_sewer', ['tank', 'tank', 'tank', 'tank', 'tank'], BIG);
    return Object.values(five).every((v) => v === Math.round((BIG / 5) * 0.8)) ? null : 'five Melee in the Sewer paid ' + JSON.stringify(five);
  },
  /* `raw` is the even share (spec §3.6 #3): the gap to `amount` is the party factor, and the hook still multiplies on top. */
  'party-class-raw-is-the-even-share': (M) => {
    const w = worldOf(M, [unit(M, 1, 'hero', { role: 'tank' }), unit(M, 2, 'hero', { role: 'mage' }), unit(M, 9, 'mon')]);
    const sc = ctx35(M, 8, { xpMultOf: (h) => (h.id === 1 ? 2 : 1) });
    const paid = M.xpshare.shareKillXp({ world: w, ground: { id: 'mill_cellar' }, grid: null, occ: null }, { t: 9, u: 1, xp: BIG }, sc);
    if (paid[1] !== Math.round(BIG * 1.21) || paid[2] !== Math.round((BIG / 2) * 1.21)) return 'the factor and the hook paid ' + JSON.stringify(paid);
    const xp = ofType(sc, 'xp');
    return xp.length === 2 && xp.every((e) => e.raw === BIG / 2) ? null : 'raw must stay the even share: ' + JSON.stringify(xp);
  },
  /* LEVEL XP ONLY (designer 10-31): a mixed party on a real row earns the same coin and the same skill XP as the same party
     on a flat copy of the ground (no row), every die the same; only Level XP moves. */
  'party-class-level-xp-only': async (M) => {
    const play = (id) => {
      const totals = { level: 0, skill: 0, gold: 0, kills: 0 };
      const fx = () => ({ addLevelXp: (n) => { totals.level += n; }, addXp: (k, n) => { totals.skill += n; },
        updateQuest: (type, n) => { if (type === 'kill_monster') totals.kills += n; } });
      const members = [member(M, 'a', { unitId: 1, seat: 0, hp: 100000, maxHp: 100000, fx: fx() }), member(M, 'b', { unitId: 2, seat: 1, hp: 100000, maxHp: 100000, fx: fx() })];
      members[1].hero = Object.assign({}, members[1].hero, { role: 'ranger' });
      const f = spanFixture(M, 13, { spanMs: 240000, members });
      f.ctx.ground = Object.assign({}, f.ctx.ground, { id });
      runSpan(M, f, []);
      for (const m of members) totals.gold += m.state.gold || 0;
      return totals;
    };
    const flat = play('a_ground_with_no_row'); const mixed = play('meadowbrook_thicket');
    if (flat.kills < 3) return 'the fixture killed ' + flat.kills;
    if (mixed.kills !== flat.kills) return 'the factor changed the fight: ' + mixed.kills + ' kills against ' + flat.kills;
    if (mixed.gold !== flat.gold || flat.gold <= 0) return 'gold moved with the factor: ' + mixed.gold + ' against ' + flat.gold;
    if (mixed.skill !== flat.skill) return 'skill XP moved with the factor: ' + mixed.skill + ' against ' + flat.skill;
    return mixed.level > flat.level ? null : 'CONTROL: Level XP did not move: ' + mixed.level + ' against ' + flat.level;
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
  /* XP-05: a level event per level crossed, on the one curve of each kind (src/core/xp.js): the Level's and a skill's. */
  'level-event': (M) => {
    for (const [skill, t] of [['level', M.xpcurve.charXpForLevel], ['melee', (l) => M.xpcurve.skillXpForLevel('melee', l)]]) {
      const evs = M.xpshare.levelUps(1, skill, t(2) - 1, t(4) - t(2) + 1, 500);
      if (evs.map((e) => e.level).join() !== '2,3,4' || evs.some((e) => e.atMs !== 500 || e.u !== 1)) return skill + ' levels ' + JSON.stringify(evs);
      if (M.xpshare.levelUps(1, skill, t(5), 1, 0).length) return skill + ': one XP past a threshold levelled';
    }
    return null;
  },
  /* THE XP ROUTES (CORE_MODEL.md §4; CORE_NUMBERS Q4/Q5): a kill pays the Level only; a melee blow pays Melee
     (hitXpPerDamage per HP), a bow blow Ranged, a staff blow nothing; a monster's blow at an ARMOURED hero pays
     Defense at defenseXpPerLevelPermille x its level, a miss on a shield-holder blockMult times that; no armour,
     no Defense. */
  'xp-routes': async (M) => {
    const rw = await import(new URL('src/core/hunt-rewards.js', 'file:///' + M.root.replace(/\\/g, '/') + '/').href + M.V);
    const CX = M.cm.COMBAT_XP;
    const rat = M.MONSTERS.rat;
    const pay = (member, events) => {
      const got = { level: 0 };
      member.fx = { addXp: (k, n) => { got[k] = (got[k] || 0) + n; }, addLevelXp: (n) => { got.level += n; } };
      member.state = { stats: {} }; member.hs = { tally: { kills: 0 } };
      const w = { units: [{ id: 1, side: 'hero', alive: true }, { id: 9, side: 'mon', kind: 'rat', alive: true, hp: 5 }] };
      rw.rewardSwing(new Map([[1, member]]), events, w, { rng: { int: (a) => a, chance: () => false }, monsters: M.MONSTERS });
      return got;
    };
    const m = (family, armoured, shield) => ({ family, armoured, shield, bonus: () => 0, weakness: () => ({ dropMult: 1 }) });
    let g = pay(m('sword', false, false), [{ type: 'xp', u: 1, amount: 12 }]);
    if (g.level !== 12 || Object.keys(g).length !== 1) return 'a kill paid ' + JSON.stringify(g) + ', want the Level only';
    g = pay(m('sword', false, false), [{ type: 'dmg', u: 1, t: 9, amount: 4 }]);
    if (g.melee !== 4 * CX.hitXpPerDamage || g.ranged || g.magic) return 'a sword blow paid ' + JSON.stringify(g);
    g = pay(m('ranged', false, false), [{ type: 'dmg', u: 1, t: 9, amount: 4 }]);
    if (g.ranged !== 4 * CX.hitXpPerDamage || g.melee) return 'a bow blow paid ' + JSON.stringify(g);
    g = pay(m('magic', false, false), [{ type: 'dmg', u: 1, t: 9, amount: 4 }]);
    if (g.magic || g.melee || g.ranged) return 'a staff blow paid damage XP: ' + JSON.stringify(g);
    const lv = M.monLevelOf(rat);
    const def = lv * CX.defenseXpPerLevelPermille / 1000;
    g = pay(m('sword', true, false), [{ type: 'dmg', u: 9, t: 1, amount: 3 }, { type: 'miss', u: 9, t: 1 }]);
    if (Math.abs((g.defense || 0) - 2 * def) > 1e-9) return 'two blows at an armoured hero paid Defense ' + g.defense + ', want ' + 2 * def;
    g = pay(m('sword', true, true), [{ type: 'miss', u: 9, t: 1 }]);
    if (Math.abs((g.defense || 0) - def * CX.blockMult) > 1e-9) return 'a shield block paid Defense ' + g.defense + ', want ' + def * CX.blockMult;
    g = pay(m('sword', false, true), [{ type: 'dmg', u: 9, t: 1, amount: 3 }, { type: 'miss', u: 9, t: 1 }]);
    return g.defense ? 'an unarmoured hero trained Defense: ' + g.defense : null;
  },
  /* RULING K7 + Tyler 2026-10-22: a DODGE (medium armour) is a blow aimed and turned aside, so it trains Defense at
     the plain rate even on a shield-holder (a block is the shield's, not the footwork's); a status TICK (`dot`:
     poison, burn, bleed) is not a blow and trains none. */
  'defense-dodge-and-dot': async (M) => {
    const rw = await import(new URL('src/core/hunt-rewards.js', 'file:///' + M.root.replace(/\\/g, '/') + '/').href + M.V);
    const CX = M.cm.COMBAT_XP;
    const def =M.monLevelOf(M.MONSTERS.rat) * CX.defenseXpPerLevelPermille / 1000;
    const pay = (events) => {
      const got = {};
      const member = { family: 'sword', armoured: true, shield: true, bonus: () => 0, weakness: () => ({ dropMult: 1 }),
        fx: { addXp: (k, n) => { got[k] = (got[k] || 0) + n; }, addLevelXp: () => {} }, state: { stats: {} }, hs: { tally: { kills: 0 } } };
      const w = { units: [{ id: 1, side: 'hero', alive: true }, { id: 9, side: 'mon', kind: 'rat', alive: true, hp: 5 }] };
      rw.rewardSwing(new Map([[1, member]]), events, w, { rng: { int: (a) => a, chance: () => false }, monsters: M.MONSTERS });
      return got.defense || 0;
    };
    const dodged = pay([{ type: 'miss', u: 9, t: 1, dodge: true }]);
    if (Math.abs(dodged - def) > 1e-9) return 'a dodge paid Defense ' + dodged + ', want the plain ' + def;
    const tick = pay([{ type: 'dmg', u: 9, t: 1, amount: 3, ability: 'bleed', dot: true }]);
    if (tick) return 'a status tick trained Defense: ' + tick;
    const blow = pay([{ type: 'dmg', u: 9, t: 1, amount: 3, ability: 'basic' }]);
    return Math.abs(blow - def) > 1e-9 ? 'CONTROL: a landed blow paid Defense ' + blow + ', want ' + def : null;
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
    edits: [['src/core/hunt/xp-share.js', 'const paid = (raw * party * multOf(sc, h)) / 1000;', 'const paid = (raw * party * (multOf(sc, h) ? 1 : 1)) / 1000;']] },
  /* THE PARTY FACTOR (Tyler 2026-10-31, src/data/party-class-xp.js) */
  { name: 'the party factor is not paid', case: 'party-class-every-cell',
    edits: [['src/core/hunt/xp-share.js', '(raw * party * multOf(sc, h))', '(raw * 1000 * multOf(sc, h))']] },
  { name: 'a shield Melee and a Melee count as two classes', case: 'party-class-melee-is-one',
    edits: [['src/data/party-class-xp.js', "melee: Object.freeze({ label: 'Melee', roles: Object.freeze(['tank', 'melee_dps']) }),",
      "melee: Object.freeze({ label: 'Melee', roles: Object.freeze(['melee_dps']) }), tanks: Object.freeze({ label: 'Tank', roles: Object.freeze(['tank']) }),"]] },
  { name: 'the table is read once, at the first kill, and latched', case: 'party-class-death-changes-next-kill',
    edits: [['src/core/hunt/xp-share.js', 'const party = partyClassXp(groundId, heroes.map((h) => h.role)).permille;',
      'const party = (globalThis.__partyLatch = globalThis.__partyLatch || partyClassXp(groundId, heroes.map((h) => h.role)).permille);']] },
  { name: 'the ground is ignored: every ground reads the Cellar\'s row', case: 'party-class-every-cell',
    edits: [['src/core/hunt/xp-share.js', "partyClassXp(groundId, heroes", "partyClassXp('mill_cellar', heroes"]] },
  { name: 'one Sewer cell drifts (a same-class duo back to the even share)', case: 'party-class-every-cell',
    edits: [['src/data/party-class-xp.js', 'millrace_sewer: row([800, 1100]', 'millrace_sewer: row([1000, 1100]']] },
  { name: 'a ground with no row pays a bonus', case: 'party-class-no-row-is-even',
    edits: [['src/data/party-class-xp.js', "if (n < 2 || !Object.hasOwn(PARTY_CLASS_XP, groundId)) return { permille: 1000, classes };", "if (n < 2) return { permille: 1000, classes }; if (!Object.hasOwn(PARTY_CLASS_XP, groundId)) return { permille: 1200, classes };"]] },
  { name: 'a hero alone reads a party cell', case: 'party-class-no-row-is-even',
    edits: [['src/data/party-class-xp.js', "if (n < 2 || !Object.hasOwn(PARTY_CLASS_XP, groundId)) return { permille: 1000, classes };", "if (!Object.hasOwn(PARTY_CLASS_XP, groundId)) return { permille: 1000, classes }; if (n < 2) return { permille: PARTY_CLASS_XP[groundId][2][1], classes };"]] },
  { name: 'raw XP carries the party factor', case: 'party-class-raw-is-the-even-share',
    edits: [['src/core/hunt/xp-share.js', 'raw: Math.floor(raw + 1e-9)', 'raw: Math.floor((raw * party) / 1000 + 1e-9)']] },
  { name: 'skill XP follows the party factor', case: 'party-class-level-xp-only',
    edits: [['src/core/hunt-rewards.js', "if (m && ev.amount > 0) call(m.fx, 'addLevelXp', ev.amount, ev.raw, ev.ev);", "if (m && ev.amount > 0) { call(m.fx, 'addLevelXp', ev.amount, ev.raw, ev.ev); call(m.fx, 'addXp', 'melee', ev.amount); }"]] },
  { name: 'the +XP group closes at once', case: 'group-window-1s',
    edits: [['src/core/hunt/xp-share.js', 'sc.atMs < g.at + HUNT_XP.groupMs', 'sc.atMs < g.at']] },
  { name: 'the open group is not persisted', case: 'group-survives-a-cut',
    edits: [['src/core/hunt/xp-share.js', "world: Object.freeze([['xpGroup', 'json']])", 'world: Object.freeze([])']] },
  { name: 'the attended kill bypasses the rule', case: 'attended-kill-xp-through-the-rule',
    edits: [['src/core/hunt-rewards.js', "call(m.fx, 'addLevelXp', ev.amount, ev.raw, ev.ev);", "call(m.fx, 'addLevelXp', ev.raw, ev.raw, ev.ev);"]] },
  { name: 'the away kill bypasses the rule', case: 'away-kill-xp-through-the-rule',
    edits: [['src/core/hunt-rewards.js', "call(m.fx, 'addLevelXp', ev.amount, ev.raw, ev.ev);", "call(m.fx, 'addLevelXp', ev.raw, ev.raw, ev.ev);"]] },
  { name: 'a kill pays a combat skill too', case: 'xp-routes',
    edits: [['src/core/hunt-rewards.js', "if (m && ev.amount > 0) call(m.fx, 'addLevelXp', ev.amount, ev.raw, ev.ev);", "if (m && ev.amount > 0) { call(m.fx, 'addLevelXp', ev.amount, ev.raw, ev.ev); call(m.fx, 'addXp', 'melee', ev.amount); }"]] },
  { name: 'a staff blow pays damage XP', case: 'xp-routes',
    edits: [['src/data/skills.js', "export const DAMAGE_XP_FAMILIES = Object.freeze(['sword', 'hammer', 'axe', 'ranged', 'neutral']);", "export const DAMAGE_XP_FAMILIES = Object.freeze(['sword', 'hammer', 'axe', 'ranged', 'neutral', 'magic']);"]] },
  { name: 'Defense trains without armour', case: 'xp-routes',
    edits: [['src/core/hunt-rewards.js', "if (!m || m.armoured !== true || !attacker", "if (!m || !attacker"]] },
  { name: 'a shield block pays no extra', case: 'xp-routes',
    edits: [['src/core/hunt-rewards.js', '(missed && m.shield === true ? COMBAT_XP.blockMult : 1)', '1']] },
  { name: 'Defense ignores the attacker level', case: 'xp-routes',
    edits: [['src/core/hunt-rewards.js', '(lv * COMBAT_XP.defenseXpPerLevelPermille / 1000)', '(COMBAT_XP.defenseXpPerLevelPermille / 1000)']] },
  { name: 'a dodge pays a shield block', case: 'defense-dodge-and-dot',
    edits: [['src/core/hunt-rewards.js', "defenseXp(aimed, unitOf(ev.u), ev.dodge !== true, ctx)", "defenseXp(aimed, unitOf(ev.u), true, ctx)"]] },
  { name: 'a status tick trains Defense', case: 'defense-dodge-and-dot',
    edits: [['src/core/hunt-rewards.js', "const hit = ev.dot === true ? null : members.get(ev.t);", "const hit = members.get(ev.t);"]] },
  { name: 'Magic XP drifts off 1.5', case: 'magic-xp-from-mana',
    edits: [['src/data/hunt-xp.js', 'magicXpPermillePerMana: 1500,', 'magicXpPermillePerMana: 1000,']] },
];

await suite35('hunt-core/xp-share', cases, mutants);
