// tests/hunt-core/talent-effects.mjs — THE ENGINE PIECES the Roads, Signatures and Traits share, each played (lane/talent-effects,
// systems, 2026-11-23; docs/design/redesign/15 "New engine pieces", 16, 17). Run by run-all.mjs.
//
//   heal-over-time      Steady Mend lays its whole heal as a Mending stack (6 ticks, no instant heal); Lingering Mending lays 25% again
//   healing-received    Bright Mend +6% near fall-back only; Mending Ward +6% on an ally holding the healer's own ward only; the cap
//   targeting           Deep Shelter's two lowest, Twin Ward's second ally, Tank Ward's most held, Pinning Frost's one monster, Long
//                       Reach's tile, Split Mending's second ally, Wide Sickness's wider square
//   per-target-output   Second Wind near fall-back and not, Stone Wall on self and others, Front Circle by row, Tank's Ward on a tank
//   status-strength     Pinning Frost +50% Chill, Slowing Frost's wind-up share, Weakening Sickness's Sapped, Cold Ground's patch
//   reactions           Cold Iron chills a melee attacker 2 s; Taunting Guard and Shield Priest on a taunt; Guarding Challenge casts out
//                       of turn on a back-row hit; Echoing Challenge's reset on a taunt lost; Lifeline's free heal and its clock;
//                       Draining Sickness heals the lowest; a reaction never sets off another
//   cooldown-reset-cap  a cut never passes its cycle's cap, never before now, and a new cast starts a new cycle
//   mana-returns        Thrifty Mending, Mana Circle, Full Spring, Lasting Ward's refund on recast, Still Mind's regen
//   echo-and-carry      a second hit lands its share later, exactly; an overkill carries to the nearest monster, capped
//   unit-rules          Hold Fast keeps monsters on the tank, Bodyguard takes its share, Drawing Challenge holds a Stalker
//   every-option-playable  every option and waystone row of the map reaches the engine; the one held rule is listed with its reason
//   real-settle-both-paths  a tank and a healer with many pieces in a real four: 10-minute and 100-second windows play one hunt, and the
//                       pieces fire (Mending ticks, reaction heals)
//
// mutant-anchors: src/core/hunt/cast-targets.js src/core/hunt/heal-rules.js src/core/hunt/reactions.js src/core/hunt/react-queue.js src/core/hunt/abilities.js src/core/hunt/damage.js src/core/hunt/talent-rows.js src/core/hunt/status.js src/core/hunt/targeting.js src/core/hunt/status-effects.js src/core/talents.js
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadCore, plant, makeReport, ROOT } from './fixtures/h1.js';
import { H, E, inst2, sc2, world } from './fixtures/h2.js';
import { supplySession } from './fixtures/h4.js';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);
async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.TD = await imp('src/data/talents.js');
  M.T = await imp('src/core/talents.js');
  M.TR = await imp('src/core/hunt/talent-rows.js');
  M.RX = await imp('src/core/hunt/reactions.js');
  M.HC = await imp('src/core/hunt/heal-cut.js');
  M.SE = await imp('src/core/hunt/status-effects.js');
  M.MS = await imp('src/core/hunt/monster-roles.js');
  M.AD = await imp('src/data/abilities.js');
  M.ST = await imp('src/data/statuses.js');
  M.DG = await imp('src/data/danger.js');
  M.CD = await imp('src/data/consumables.js');
  M.conditions = M.hunt.conditions;
  return M;
}

/* ── builders ── */
const ORDER = ['r1', 'r2', 'r3', 'x1', 'w1', 'r4', 'r5', 'x2', 'w2'];
/* a road walked to its picks: stones, crossroads I (x1), crossroads II (x2), the waystones only when asked */
function road(move, x1, x2, ways) {
  const b = {};
  for (const s of ORDER) {
    if ((s === 'w1' || s === 'w2') && !ways) continue;
    if ((s === 'r4' || s === 'r5' || s === 'x2' || s === 'w2') && !x2) continue;
    b[move + '.' + s] = s === 'x1' ? x1 : s === 'x2' ? x2 : true;
  }
  return b;
}
const grant = (M, u, build, discipline, L) => M.TR.syncTalents(u, { talents: build, discipline }, L || 200);
/* a bar slot for move `id` with no conditions (it fires whenever ready), naming the store's rune of its family */
function slotFor(M, id) {
  const row = M.AD.ABILITIES[id];
  const store = row.rune ? M.SB.BASIC_SUPPLIES.find((b) => b.partner === row.rune) : null;
  return { action: { type: 'ability', id, ...(store ? { store: store.id } : {}) }, conditions: [], join: 'and' };
}
const entry = (M, ids, range) => ({ hs: supplySession(M, { runes: true }), actionSet: 'hunt', range: range || 1, slots: M.conditions.heroSlots(ids.map((id) => slotFor(M, id)), null) });
const fight = (M, units, o) => inst2(M, world(M, units, Object.assign({ phase: 'fight', risk: 'steady' }, o || {})));
const heals = (sc, t) => sc.events.filter((e) => e.type === 'heal' && (t === undefined || e.t === t));
const sum = (l) => l.reduce((a, e) => a + e.amount, 0);
const tick = (M, inst, sc, n) => { for (let i = 0; i < n; i++) { sc.atMs += 100; inst.atMs = sc.atMs; M.status.tickStatuses(inst, sc); } };
/* the highest HP at which hero `u` is near fall-back in `inst` (talent-rows.js nearFall: its stance's line, the holder's lower) */
const nearHp = (M, inst, u) => { let hp = u.maxHp; while (hp > 0 && !M.TR.nearFall(inst, u, hp)) hp--; return hp; };
const healer = (M, id, x, y, o) => H(M, id, x, y, 'healer', Object.assign({ mana: 2000, maxMana: 2000, maxHit: 40 }, o || {}));

const cases = {
  'heal-over-time': (M) => {
    const u = healer(M, 1, 12, 3, { hp: 40 });
    const inst = fight(M, [u]);
    inst.heroes = { 1: entry(M, ['mend']) };
    grant(M, u, road('mend', 'steady_mend'), 'restoration');
    const sc = sc2(M, 1);
    M.abilities.castAbilities(inst, sc);
    if (!sc.events.some((e) => e.type === 'cast' && e.ability === 'mend')) return 'Mend was not cast';
    if (heals(sc, 1).length) return 'Steady Mend healed at once: ' + JSON.stringify(heals(sc, 1));
    const st = (u.statuses || []).find((s) => s.s === 'mending');
    const whole = M.AD.castAmount(M.TR.rowFor(u, 'mend'), u.maxHit, u.maxHp, 1000).heal;
    if (!st || st.left !== 6000 || st.amt !== Math.floor(whole / 6)) return 'no Mending stack of the heal over 6 s: ' + JSON.stringify(st) + ' heal ' + whole;
    if (whole <= M.AD.castAmount(M.AD.ABILITIES.mend, u.maxHit, u.maxHp, 1000).heal) return 'Steady Mend\'s +25% did not reach the heal';
    tick(M, inst, sc, 61);
    const t = heals(sc, 1);
    if (t.length !== 6 || sum(t) !== 6 * st.amt || u.hp !== 40 + 6 * st.amt) return 'the stack ticked ' + t.length + ' times for ' + sum(t);
    /* Lingering Mending: the heal at once, and 25% of it again over 4 s */
    const g = healer(M, 2, 12, 3, { hp: 200 }), a = H(M, 3, 13, 3, 'tank', { hp: 60 });
    const i2 = fight(M, [g, a]);
    i2.heroes = { 2: entry(M, ['greater_mend']) };
    grant(M, g, road('greater_mend', 'split_mending', 'lingering_mending'), 'restoration');
    const s2 = sc2(M, 2);
    M.abilities.castAbilities(i2, s2);
    const now = heals(s2, 3)[0];
    const lay = (a.statuses || []).find((s) => s.s === 'mending');
    if (!now || !lay || lay.left !== 4000 || lay.amt < 1) return 'Lingering Mending: ' + JSON.stringify({ now, lay });
    return null;
  },
  'healing-received': (M) => {
    const u = H(M, 1, 12, 3, 'tank', { hp: 200 });
    const inst = fight(M, [u]);
    grant(M, u, { ...road('mend', 'steady_mend', 'bright_mend') }, 'shield');
    if (M.HC.healIn(inst, u, 1000) !== 1000) return 'Bright Mend raised a heal far from the line';
    u.hp = nearHp(M, inst, u);
    if (M.HC.healIn(inst, u, 1000) !== 1060) return 'Bright Mend near fall-back: ' + M.HC.healIn(inst, u, 1000);
    /* Mending Ward: the healer's row raises an ally holding ITS shell, nobody else */
    const g = healer(M, 2, 12, 4), a = H(M, 3, 13, 3, 'tank', { hp: 100 });
    const i2 = fight(M, [g, a]);
    grant(M, g, { ...road('greater_mend', 'split_mending'), ...road('circle_of_renewal', 'lasting_circle'), ...road('spring_tide', 'high_tide'),
      ...road('green_sickness', 'lingering_sickness'), ...road('protective_ward', 'tank_ward', 'mending_ward') }, 'restoration');
    if (M.HC.healIn(i2, a, 1000) !== 1000) return 'an unwarded ally received more';
    a.shield = 10; a.shieldBy = 99;
    if (M.HC.healIn(i2, a, 1000) !== 1000) return 'another caster\'s shell raised it';
    a.shield = 0; a.shieldBy = 2;
    if (M.HC.healIn(i2, a, 1000) !== 1000) return 'a spent ward still raised the ally';
    a.shield = 10;
    if (M.HC.healIn(i2, a, 1000) !== 1060) return 'the warded ally received ' + M.HC.healIn(i2, a, 1000);
    /* the cap */
    u.healIn = [{ pm: 250 }, { pm: 250 }];
    if (M.HC.healIn(inst, u, 1000) !== 1000 + M.TD.TALENT_RULES.healInCapPm) return 'the healing received ran past its cap';
    return null;
  },
  'targeting': (M) => {
    /* Deep Shelter: two lowest of four, +80% */
    const k = H(M, 1, 11, 3, 'tank', { hp: 100, mana: 500, maxMana: 500, maxHit: 40 });
    const p = [H(M, 2, 12, 3, 'ranger', { hp: 150 }), H(M, 3, 13, 3, 'mage', { hp: 50 }), H(M, 4, 14, 3, 'healer', { hp: 190 })];
    const inst = fight(M, [k, ...p]);
    inst.heroes = { 1: entry(M, ['shelter']) };
    grant(M, k, { ...road('challenge', 'long_hold'), ...road('frost_slam', 'long_frost'), ...road('shelter', 'deep_shelter') }, 'shield');
    const sc = sc2(M, 3);
    M.abilities.castAbilities(inst, sc);
    const shelled = [k, ...p].filter((x) => x.shield > 0).map((x) => x.id).sort();
    if (shelled.join() !== '1,3') return 'Deep Shelter shelled ' + shelled;
    /* Twin Ward: two allies; Tank Ward: the most held */
    const g = healer(M, 1, 12, 3, { hp: 200 }), t1 = H(M, 2, 13, 3, 'tank', { hp: 120 }), t2 = H(M, 3, 12, 4, 'ranger', { hp: 100 });
    const m1 = E(M, 10, 0, 14, 3, 2), m2 = E(M, 11, 0, 14, 4, 2);
    const i2 = fight(M, [g, t1, t2, m1, m2]);
    i2.heroes = { 1: entry(M, ['protective_ward'], 3) };
    const wardTo = (x1) => {
      for (const x of [t1, t2]) { x.shield = 0; x.shieldBy = null; }
      g.cds = {}; g.lanes = {};
      grant(M, g, { ...road('greater_mend', 'split_mending'), ...road('circle_of_renewal', 'lasting_circle'), ...road('spring_tide', 'high_tide'),
        ...road('green_sickness', 'lingering_sickness'), ...road('protective_ward', x1) }, 'restoration');
      M.abilities.castAbilities(i2, sc2(M, 4));
      return [t1, t2].filter((x) => x.shield > 0).map((x) => x.id).join();
    };
    if (wardTo('twin_ward') !== '2,3') return 'Twin Ward shelled ' + wardTo('twin_ward');
    if (wardTo('tank_ward') !== '2') return 'Tank Ward did not take the ally the monsters are on: ' + wardTo('tank_ward');
    /* Pinning Frost: one of three beside the tank */
    const kk = H(M, 1, 12, 3, 'tank', { mana: 500, maxMana: 500, maxHit: 40 }), other = H(M, 2, 9, 3, 'ranger');
    const ms = [E(M, 10, 0, 13, 3, 1), E(M, 11, 0, 11, 3, 1), E(M, 12, 0, 12, 4, 1)];
    const i3 = fight(M, [kk, other, ...ms]);
    i3.heroes = { 1: entry(M, ['frost_slam']) };
    kk.target = 11;
    grant(M, kk, { ...road('challenge', 'long_hold'), ...road('frost_slam', 'pinning_frost') }, 'shield');
    M.abilities.castAbilities(i3, sc2(M, 5));
    const chilled = ms.filter((m) => (m.statuses || []).some((s) => s.s === 'chill')).map((m) => m.id);
    if (chilled.join() !== '11') return 'Pinning Frost chilled ' + chilled;
    /* Long Reach: a Melee healer's ally two tiles off is in reach with the tile */
    const reachOf = (b) => {
      const h = healer(M, 1, 12, 3), a = H(M, 2, 14, 3, 'tank', { hp: 100 });
      const ix = fight(M, [h, a]);
      ix.heroes = { 1: entry(M, ['greater_mend']) };
      if (b) grant(M, h, b, 'restoration');
      const s = sc2(M, 6);
      M.abilities.castAbilities(ix, s);
      return heals(s, 2).length;
    };
    if (reachOf(null) !== 0) return 'a Melee healer reached two tiles with no road';
    if (reachOf({ ...road('greater_mend', 'split_mending', null, true) }) !== 1) return 'Long Reach did not reach a tile further';
    /* Split Mending: 30% on the next lowest */
    const sg = healer(M, 1, 12, 3, { hp: 200 }), lo = H(M, 2, 13, 3, 'tank', { hp: 50 }), nx = H(M, 3, 12, 4, 'ranger', { hp: 120 });
    const i4 = fight(M, [sg, lo, nx]);
    i4.heroes = { 1: entry(M, ['greater_mend']) };
    grant(M, sg, road('greater_mend', 'split_mending'), 'restoration');
    const s4 = sc2(M, 7);
    M.abilities.castAbilities(i4, s4);
    const first = heals(s4, 2)[0], second = heals(s4, 3)[0];
    if (!first || !second || second.ability !== 'greater_mend') return 'Split Mending: ' + JSON.stringify(s4.events.filter((e) => e.type === 'heal'));
    /* Wide Sickness: the square is two tiles wider */
    const wide = M.AD.areaSpec(M.TR.moddedRow(M.AD.ABILITIES.green_sickness, M.T.grantsOf({ ...road('greater_mend', 'split_mending'), ...road('circle_of_renewal', 'lasting_circle'),
      ...road('spring_tide', 'high_tide'), ...road('green_sickness', 'lingering_sickness', 'wide_sickness') }, 'restoration', 200).mods.green_sickness));
    if (wide.n !== M.AD.areaSpec(M.AD.ABILITIES.green_sickness).n + 2) return 'Wide Sickness\'s square: ' + JSON.stringify(wide);
    return null;
  },
  'per-target-output': (M) => {
    const u = H(M, 1, 12, 3, 'tank', { hp: 200 }), a = H(M, 2, 13, 3, 'mage', { hp: 200 });
    const inst = fight(M, [u, a]);
    const pm = (build, disc, move, t) => { grant(M, u, build, disc); return M.TR.outPmFor(inst, u, M.TR.rowFor(u, move), t); };
    const sw = road('mend', 'second_wind');
    if (pm(sw, 'shield', 'mend', u) !== 800) return 'Second Wind far from the line: ' + pm(sw, 'shield', 'mend', u);
    u.hp = nearHp(M, inst, u);
    if (pm(sw, 'shield', 'mend', u) !== 1600) return 'Second Wind near the line: ' + pm(sw, 'shield', 'mend', u);
    u.hp = 200;
    const sh = { ...road('challenge', 'long_hold'), ...road('frost_slam', 'long_frost'), ...road('shelter', 'stone_wall') };
    if (pm(sh, 'shield', 'shelter', u) !== 2000 || pm(sh, 'shield', 'shelter', a) !== 700) return 'Stone Wall: ' + pm(sh, 'shield', 'shelter', u) + ' / ' + pm(sh, 'shield', 'shelter', a);
    const rest = { ...road('greater_mend', 'split_mending'), ...road('circle_of_renewal', 'lasting_circle', 'front_circle') };
    if (pm(rest, 'restoration', 'circle_of_renewal', u) !== 1150 || pm(rest, 'restoration', 'circle_of_renewal', a) !== 850) return 'Front Circle by row';
    const tw = { ...road('greater_mend', 'split_mending'), ...road('circle_of_renewal', 'lasting_circle'), ...road('spring_tide', 'high_tide'),
      ...road('green_sickness', 'lingering_sickness'), ...road('protective_ward', 'tank_ward', 'quick_ward', true) };
    if (pm(tw, 'restoration', 'protective_ward', u) !== 1100 || pm(tw, 'restoration', 'protective_ward', a) !== 1000) return 'Tank\'s Ward';
    return null;
  },
  'status-strength': (M) => {
    const k = H(M, 1, 12, 3, 'tank', { mana: 500, maxMana: 500, maxHit: 40 }), other = H(M, 2, 9, 3, 'ranger');
    const m = E(M, 10, 0, 13, 3, 1);
    const inst = fight(M, [k, other, m]);
    inst.heroes = { 1: entry(M, ['frost_slam']) };
    const slam = (x1, x2) => {
      m.statuses = []; k.cds = {}; k.lanes = {}; k.statuses = [];
      grant(M, k, { ...road('challenge', 'long_hold'), ...road('frost_slam', x1, x2) }, 'shield');
      M.abilities.castAbilities(inst, sc2(M, 8));
    };
    slam('long_frost');
    const base = M.SE.effectPm(m, 'slowPm');
    slam('pinning_frost');
    if (M.SE.effectPm(m, 'slowPm') !== Math.trunc((base * 1500) / 1000)) return 'Pinning Frost\'s Chill: ' + M.SE.effectPm(m, 'slowPm') + ' vs ' + base;
    slam('slowing_frost');
    if (M.SE.effectPm(m, 'slowPm') !== Math.trunc(base / 2) || M.SE.effectPm(m, 'windupSlowPm') !== base * 2) return 'Slowing Frost: attacks ' + M.SE.effectPm(m, 'slowPm') + ', wind-ups ' + M.SE.effectPm(m, 'windupSlowPm');
    slam('long_frost', 'cold_ground');
    const patch = (k.statuses || []).find((s) => s.s === 'frozen_ground');
    if (!patch || patch.at[0] !== 12 || patch.at[1] !== 3) return 'Cold Ground left no patch at the tank: ' + JSON.stringify(k.statuses);
    m.statuses = [];
    const sc = sc2(M, 9);
    tick(M, inst, sc, 10);
    if (!(m.statuses || []).some((s) => s.s === 'chill' && s.src === 1)) return 'the patch did not lay Chill on the monster in it';
    /* Weakening Sickness: Sapped beside Sickness */
    const g = healer(M, 1, 12, 3), mm = E(M, 10, 0, 13, 3, 1, { hp: 9000, maxHp: 9000 });
    const i2 = fight(M, [g, mm]);
    i2.heroes = { 1: entry(M, ['green_sickness'], 3) };
    g.target = 10;
    grant(M, g, { ...road('greater_mend', 'split_mending'), ...road('circle_of_renewal', 'lasting_circle'), ...road('spring_tide', 'high_tide'),
      ...road('green_sickness', 'lingering_sickness', 'weakening_sickness') }, 'restoration');
    M.abilities.castAbilities(i2, sc2(M, 10));
    if (M.SE.effectPm(mm, 'dealtPm') !== M.ST.STATUSES.sapped.dealtPm) return 'Weakening Sickness: ' + JSON.stringify(mm.statuses);
    return null;
  },
  'reactions': (M) => {
    /* Cold Iron: a melee hit taken chills the attacker for 2 s */
    const k = H(M, 1, 12, 3, 'tank', { hp: 200 }), m = E(M, 10, 0, 13, 3, 1, { maxHit: 5 });
    const inst = fight(M, [k, m]);
    grant(M, k, { ...road('challenge', 'long_hold'), 'vow.cold_iron': true }, 'shield', 60);
    const sc = sc2(M, 11);
    M.damage.landHit(inst, sc, m, k, 5, null, null, false);
    if ((m.statuses || []).length) return 'a reaction ran before its drain';
    M.RX.drainReactions(inst, sc);
    const ch = (m.statuses || []).find((s) => s.s === 'chill' && s.src === 1);
    if (!ch || ch.left !== 2000) return 'Cold Iron: ' + JSON.stringify(m.statuses);
    /* Taunting Guard + Shield Priest: a Challenge that takes two shells the tank 2% x 2 and heals it 3% */
    const t = H(M, 1, 11, 3, 'tank', { hp: 100, maxHp: 1000 }), r = H(M, 2, 16, 5, 'ranger');
    const a1 = E(M, 10, 0, 13, 3, 2), a2 = E(M, 11, 0, 13, 4, 2);
    const i2 = fight(M, [t, r, a1, a2], { leader: 1 });
    i2.heroes = { 1: entry(M, ['challenge']) };
    const hybrid = { ...road('challenge', 'long_hold'), ...road('greater_mend', 'split_mending'), 'border.shield_restoration.town': 'use_greater_mend',
      'border.shield_restoration.x': 'taunting_guard', 'border.shield_restoration.vow': true };
    grant(M, t, hybrid, 'shield');
    const s2 = sc2(M, 12);
    M.targeting.chooseTargets(i2, s2); M.abilities.castAbilities(i2, s2); M.RX.drainReactions(i2, s2);
    if (t.shield !== 40) return 'Taunting Guard: a shell of ' + t.shield + ' (want 2% x 1000 x 2 taunted)';
    if (sum(heals(s2, 1)) !== 30) return 'Shield Priest healed ' + sum(heals(s2, 1));
    /* Guarding Challenge: a back-row ally hit casts the Challenge out of turn, its lane busy */
    const gk = H(M, 1, 11, 3, 'tank'), back = H(M, 2, 13, 3, 'mage'), bm = E(M, 10, 0, 14, 3, 2);
    const i3 = fight(M, [gk, back, bm], { leader: 1 });
    i3.heroes = { 1: entry(M, ['challenge']) };
    grant(M, gk, road('challenge', 'guarding_challenge'), 'shield');
    gk.lanes = { support: 999999 };
    const s3 = sc2(M, 13);
    M.damage.landHit(i3, s3, bm, back, 5, null, null, false);
    M.RX.drainReactions(i3, s3);
    if (bm.target !== 1 || !s3.events.some((e) => e.type === 'cast' && e.ability === 'challenge')) return 'Guarding Challenge did not cast on the back-row hit';
    /* Echoing Challenge: a held monster turned away from its living challenger (a Stalker's dive) resets the Challenge to now */
    const ek = H(M, 1, 11, 3, 'tank'), er = H(M, 2, 13, 5, 'ranger'), em = E(M, 10, 0, 12, 3, 1, { holdMs: 4000 });
    const i4 = fight(M, [ek, er, em], { leader: 1 });
    grant(M, ek, road('challenge', 'long_hold', 'echoing_challenge'), 'shield');
    ek.cds = { challenge: 9000 };
    const s4 = sc2(M, 14, 1000);
    M.targeting.retarget(i4, em, 2, s4);
    if (!(i4.reactQ || []).some((q) => q.row.on === 'taunt_lost')) return 'a held monster turned away queued no taunt lost';
    M.RX.drainReactions(i4, s4);
    if (ek.cds.challenge !== 1000) return 'Echoing Challenge: cooldown ' + ek.cds.challenge;
    /* Lifeline: an ally falling near the line takes a free heal at once, then not again for 10 s */
    const lg = healer(M, 1, 12, 3, { hp: 200, mana: 0 }), la = H(M, 2, 13, 3, 'tank', { hp: 200, maxHp: 200 }), lm = E(M, 10, 0, 14, 3, 2);
    const i5 = fight(M, [lg, la, lm]);
    i5.heroes = { 1: entry(M, ['greater_mend']) };
    grant(M, lg, { ...road('greater_mend', 'split_mending'), 'vow.lifeline': true }, 'restoration', 60);
    lg.lanes = { heal: 999999 };
    const s5 = sc2(M, 15);
    M.damage.landHit(i5, s5, lm, la, 200 - nearHp(M, i5, la), null, { id: 't', exact: true }, false);
    M.RX.drainReactions(i5, s5);
    const cast = s5.events.find((e) => e.type === 'cast' && e.ability === 'greater_mend');
    if (!cast || cast.mana !== 0 || lg.mana !== 0 || !heals(s5, 2).length) return 'Lifeline\'s free heal: ' + JSON.stringify(cast);
    la.hp = 200; lg.cds.greater_mend = 0;
    s5.atMs = 5000;
    M.damage.landHit(i5, s5, lm, la, 200 - nearHp(M, i5, la), null, { id: 't', exact: true }, false);
    M.RX.drainReactions(i5, s5);
    if (s5.events.filter((e) => e.type === 'cast').length !== 1) return 'Lifeline fired twice inside its 10 s';
    /* Draining Sickness: a hit of Green Sickness heals the lowest ally 20% of it; no reaction sets off another */
    const dg = healer(M, 1, 12, 3, { hp: 200 }), low = H(M, 2, 13, 3, 'tank', { hp: 50 }), dm = E(M, 10, 0, 14, 3, 2, { hp: 9000, maxHp: 9000 });
    const i6 = fight(M, [dg, low, dm]);
    grant(M, dg, { ...road('greater_mend', 'split_mending'), ...road('circle_of_renewal', 'lasting_circle'), ...road('spring_tide', 'high_tide'),
      ...road('green_sickness', 'draining_sickness') }, 'restoration');
    const s6 = sc2(M, 16);
    M.damage.landHit(i6, s6, dg, dm, 100, null, { id: 'fireball', exact: true }, false);
    M.damage.landHit(i6, s6, dg, dm, 100, null, { id: 'green_sickness', exact: true }, false);
    M.RX.drainReactions(i6, s6);
    if (sum(heals(s6, 2)) !== 20) return 'Draining Sickness healed ' + sum(heals(s6, 2)) + ' (only its own hits, 20%)';
    i6.reacting = true;
    M.damage.landHit(i6, s6, dg, dm, 100, null, { id: 'green_sickness', exact: true }, false);
    if (i6.reactQ && i6.reactQ.length) return 'a moment was queued while the queue drained';
    return null;
  },
  'cooldown-reset-cap': (M) => {
    const u = H(M, 1, 12, 3, 'tank');
    u.cds = { challenge: 10000 };
    if (!M.RX.cutCooldown(u, 'challenge', 1000, 4000, 0) || u.cds.challenge !== 9000) return 'one cut: ' + u.cds.challenge;
    for (let i = 0; i < 10; i++) M.RX.cutCooldown(u, 'challenge', 1000, 4000, 0);
    if (u.cds.challenge !== 6000) return 'the cycle\'s cap: ' + u.cds.challenge;
    if (M.RX.cutCooldown(u, 'challenge', 1000, 4000, 0)) return 'a cut past the cap moved it';
    if (!M.RX.cutCooldown(u, 'challenge', 60000, 60000, 5000) || u.cds.challenge !== 5000) return 'a full reset passed now: ' + u.cds.challenge;
    /* a new cast is a new cycle */
    u.cds = Object.assign({}, u.cds, { challenge: 20000 });
    if (!M.RX.cutCooldown(u, 'challenge', 5000, 4000, 7000) || u.cds.challenge !== 16000) return 'a new cycle kept the old cap: ' + u.cds.challenge;
    return null;
  },
  'mana-returns': (M) => {
    const rest = (x2, y) => ({ ...road('greater_mend', 'split_mending', x2), ...(y || {}) });
    /* Thrifty Mending: half the mana back on a heal of an ally near the line, none otherwise */
    const run = (hp, b, ids, units) => {
      const g = healer(M, 1, 12, 3, { hp: 200, mana: 1000, maxMana: 2000 }), a = H(M, 2, 13, 3, 'tank', { hp });
      const inst = fight(M, [g, a, ...(units || [])]);
      inst.heroes = { 1: entry(M, ids || ['greater_mend']) };
      grant(M, g, b, 'restoration');
      const sc = sc2(M, 17);
      M.abilities.castAbilities(inst, sc);
      return { g, a, cast: sc.events.find((e) => e.type === 'cast'), sc };
    };
    const far = run(150, rest('thrifty_mending'));
    if (!far.cast || far.g.mana !== 1000 - far.cast.mana) return 'Thrifty Mending gave mana back far from the line';
    const probe = H(M, 2, 13, 3, 'tank');
    const near = run(nearHp(M, fight(M, [probe]), probe), rest('thrifty_mending'));
    if (near.g.mana !== 1000 - near.cast.mana + Math.floor(near.cast.mana / 2)) return 'Thrifty Mending near the line: ' + near.g.mana;
    /* Mana Circle: each ally healed +2% of its max mana; Full Spring: the caster +2% */
    const circ = { ...road('greater_mend', 'split_mending'), ...road('circle_of_renewal', 'lasting_circle', 'mana_circle') };
    const c = (() => {
      const g = healer(M, 1, 12, 3, { hp: 200, mana: 1000, maxMana: 2000 }), a = H(M, 2, 13, 3, 'tank', { hp: 150, mana: 0, maxMana: 500 }), b = H(M, 3, 12, 4, 'mage', { hp: 150, mana: 0, maxMana: 500 });
      const inst = fight(M, [g, a, b]);
      inst.heroes = { 1: entry(M, ['circle_of_renewal']) };
      grant(M, g, circ, 'restoration');
      M.abilities.castAbilities(inst, sc2(M, 18));
      return [a.mana, b.mana];
    })();
    if (c.join() !== '10,10') return 'Mana Circle: ' + c;
    const fs = { ...road('greater_mend', 'split_mending'), ...road('circle_of_renewal', 'lasting_circle'), ...road('spring_tide', 'high_tide', null, true) };
    const sp = run(100, fs, ['spring_tide']);
    if (!sp.cast || sp.g.mana !== 1000 - sp.cast.mana + 40) return 'Full Spring: ' + sp.g.mana + ' after ' + JSON.stringify(sp.cast);
    /* Lasting Ward: a recast over the caster's own chipped ward refunds its rest */
    const lw = { ...road('greater_mend', 'split_mending'), ...road('circle_of_renewal', 'lasting_circle'), ...road('spring_tide', 'high_tide'),
      ...road('green_sickness', 'lingering_sickness'), ...road('protective_ward', 'lasting_ward') };
    const g = healer(M, 1, 12, 3, { hp: 200, mana: 1000 }), a = H(M, 2, 13, 3, 'tank', { hp: 100, shield: 3, shieldBy: 1 });
    const inst = fight(M, [g, a]);
    inst.heroes = { 1: entry(M, ['protective_ward']) };
    grant(M, g, lw, 'restoration');
    const sc = sc2(M, 19);
    M.abilities.castAbilities(inst, sc);
    const wc = sc.events.find((e) => e.type === 'cast');
    if (!wc || !(wc.refund > 0) || !(a.shield > 3)) return 'Lasting Ward did not recast over its own chipped ward with a refund: ' + JSON.stringify(wc);
    /* Still Mind: 3 s without a cast, half again the regen */
    const s = healer(M, 1, 12, 3, { mana: 0, maxMana: 6000 });
    const si = fight(M, [s]);
    si.heroes = { 1: entry(M, []) };
    const regen = (b, sinceMs) => { s.mana = 0; s.manaMilli = 0; s.cds = { '~cast': 0 }; grant(M, s, b, 'restoration', 200); const x = sc2(M, 20, sinceMs); for (let i = 0; i < 10; i++) M.abilities.castAbilities(si, x); return s.mana; };
    const plain = regen({}, 0);
    const still = regen({ ...road('greater_mend', 'split_mending'), 'vow.still_mind': true }, 5000);
    const busy = regen({ ...road('greater_mend', 'split_mending'), 'vow.still_mind': true }, 1000);
    if (!(still > plain) || busy !== plain) return 'Still Mind: plain ' + plain + ', still ' + still + ', just cast ' + busy;
    return null;
  },
  'echo-and-carry': (M) => {
    const u = H(M, 1, 12, 3, 'mage', { maxHit: 40 }), a = E(M, 10, 0, 13, 3, 1, { hp: 1000, maxHp: 1000 }), b = E(M, 11, 0, 14, 3, 1, { hp: 1000, maxHp: 1000 }), far = E(M, 12, 0, 18, 3, 1, { hp: 1000, maxHp: 1000 });
    const inst = fight(M, [u, a, b, far]);
    /* (a marked target: a blow through the chain would land half again; an exact one lands as it is) */
    a.markPm = 500; a.markUntil = 1e9;
    u.reacts = [{ id: 'slow_burn', on: 'hit', do: 'echo', pm: 500, ms: 2000 }, { id: 'carry', on: 'kill', do: 'carry', pm: 1000, r: 2, capPm: 300 }];
    const sc = sc2(M, 21);
    M.damage.landHit(inst, sc, u, a, 100, null, { id: 'strike', exact: true }, false);
    M.RX.drainReactions(inst, sc);
    if (a.hp !== 900) return 'set-up: ' + a.hp;
    tick(M, inst, sc, 19);
    if (a.hp !== 900) return 'the second hit landed early';
    tick(M, inst, sc, 1);
    if (a.hp !== 850) return 'the second hit: ' + a.hp + ' (want 50, 2 s later)';
    tick(M, inst, sc, 30);
    if (a.hp !== 850) return 'the second hit landed twice';
    /* a kill with 600 past its HP carries 300 (the cap: 30% of the fallen's 1000) to the nearest within 2 tiles */
    a.hp = 400;
    M.damage.landHit(inst, sc, u, a, 1000, null, { id: 'strike', exact: true }, false);
    M.RX.drainReactions(inst, sc);
    if (b.hp !== 700 || far.hp !== 1000) return 'the carry: near ' + b.hp + ', far ' + far.hp;
    return null;
  },
  'unit-rules': (M) => {
    /* Hold Fast: another tank's Challenge cannot take a monster off it, nor a reach turn it */
    const k = H(M, 1, 11, 3, 'tank'), k2 = H(M, 2, 13, 3, 'tank'), m = E(M, 10, 0, 12, 3, 1);
    const inst = fight(M, [k, k2, m], { leader: 1, hold: 2 });
    grant(M, k, { ...road('challenge', 'long_hold'), 'vow.hold_fast': true }, 'shield', 60);
    if (M.targeting.challengeable(inst, k2).length) return 'a monster on a Hold Fast tank was challengeable';
    grant(M, k, road('challenge', 'long_hold'), 'shield', 60);
    if (!M.targeting.challengeable(inst, k2).length) return 'set-up: the holder could not take it with no vow';
    /* Bodyguard: 30% of a back-row ally's blow lands on the guard */
    const g = H(M, 1, 12, 3, 'tank', { hp: 200 }), b = H(M, 2, 13, 3, 'mage', { hp: 200 }), mm = E(M, 10, 0, 14, 3, 2);
    const i2 = fight(M, [g, b, mm]);
    grant(M, g, { ...road('challenge', 'long_hold'), 'vow.bodyguard': true }, 'shield', 200);
    M.damage.landHit(i2, sc2(M, 22), mm, b, 100, null, { id: 't', exact: false, mult: 1000 }, false);
    if (200 - b.hp + 200 - g.hp !== 100 && !(g.hp < 200)) return 'Bodyguard took nothing: ' + g.hp;
    if (!(g.hp < 200) || !(b.hp > 100)) return 'Bodyguard: guard ' + g.hp + ', ward ' + b.hp;
    /* Drawing Challenge: a Stalker stays held for the whole taunt */
    const role = { reach: 'weakest', heldPm: 500 };
    const tk = H(M, 1, 11, 3, 'tank'), st = E(M, 10, 0, 12, 3, 1, { holdMs: 1000 });
    const i3 = fight(M, [tk, st]);
    void role;
    grant(M, tk, road('challenge', 'long_hold', 'drawing_challenge'), 'shield', 60);
    if (tk.tauntFull !== true) return 'Drawing Challenge wrote no full hold';
    grant(M, tk, road('challenge', 'long_hold', 'mended'), 'shield', 60);
    if (tk.tauntFull !== undefined) return 'a full hold stayed with another pick';
    void i3;
    return null;
  },
  'every-option-playable': (M) => {
    const held = M.T.heldRules();
    /* none held since lane/tuning-pass re-worded the two shield-duration nodes (29-tuning-pass.md 3.8) */
    if (held.length) return 'rules still held: ' + held.join(', ');
    /* every option and every waystone or vow with effects reaches the engine: a mod, a reaction, healing received or a unit rule */
    for (const n of M.TD.TALENT_NODES) {
      const lists = n.kind === 'crossing' ? [] : [...(n.options || []).map((o) => [o.id, o.effects]), ...(n.effects ? [[null, n.effects]] : [])];
      for (const [pick, fx] of lists) {
        if (fx.every((e) => e.kind === 'rule')) return n.id + ':' + pick + ' plays nothing';
        for (const e of fx) if (!['step', 'mod', 'react', 'heal_in', 'unit', 'borrow', 'rule'].includes(e.kind)) return n.id + ' an unknown effect';
      }
    }
    return null;
  },
  /* THE REAL SETTLE, BOTH PATHS (CLAUDE.md §4): a tank with Cold Iron, Taunting Guard and Shield Priest and a healer with Lingering
     Mending, Lasting Circle and Lifeline in a real four; 10-minute and 100-second windows play one hunt, and the pieces fire */
  'real-settle-both-paths': async (M) => {
    const { loadPlay } = await import(pathToFileURL(join(M.root, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
    const P = await loadPlay(M.root);
    const four = ['tank', 'ranger', 'mage', 'healer'];
    const tank = { ...road('challenge', 'long_hold', 'mended'), ...road('greater_mend', 'split_mending'), 'border.shield_restoration.town': 'use_greater_mend',
      'border.shield_restoration.x': 'taunting_guard', 'border.shield_restoration.vow': true, 'vow.cold_iron': true };
    const heal = { ...road('greater_mend', 'split_mending', 'lingering_mending'), ...road('circle_of_renewal', 'lasting_circle', 'mana_circle'), 'vow.lifeline': true };
    const go = (windowMs, seen) => P.run('muster_barrows', 60, four, { spanMs: 900000, windowMs, secret: '-4611686018427387904',
      options: () => ({ risk: 'steady', danger: 570 }), roads: (r, i) => (i === 0 ? tank : i === 3 ? heal : null),
      onWindow: seen ? (out) => { for (const e of out.events || []) if (e && (e.type === 'heal' || e.type === 'status_on')) seen.push(e); } : undefined });
    const sig = (r) => JSON.stringify({ t: r.totals, x: r.heroXp, m: r.members });
    const seen = [];
    const closed = go(600000, seen), viewed = go(100000);
    if (sig(closed) !== sig(viewed)) return 'the same builds settled in 10-minute and 100-second windows played two hunts';
    if (!seen.some((e) => e.type === 'status_on' && e.status === 'mending')) return 'no heal was laid over time in the real settle';
    if (!seen.some((e) => e.type === 'heal' && e.ability === 'challenge_self_heal')) return 'Shield Priest never healed in the real settle';
    return null;
  },
};

const AB = 'src/core/hunt/abilities.js';
const CT = 'src/core/hunt/cast-targets.js';
const HR = 'src/core/hunt/heal-rules.js';
const RX = 'src/core/hunt/reactions.js';
const DM = 'src/core/hunt/damage.js';
const TR = 'src/core/hunt/talent-rows.js';
const TG = 'src/core/hunt/targeting.js';
const STS = 'src/core/hunt/status.js';
const SE = 'src/core/hunt/status-effects.js';
const mutants = [
  { name: 'a heal over time lands at once', case: 'heal-over-time', edits: [[HR, '  if (fx && fx.hotAll === true && fx.hotMs > 0) layOverTime(inst, sc, u, t, n, fx.hotMs);\n  else {', '  {']] },
  { name: 'a fixed tick rolls the row', case: 'heal-over-time', edits: [[STS, '  if (Number.isInteger(st.amt) && !row.ground) { tickFixed(inst, sc, unit, row, st, units); return; }\n', '']] },
  { name: 'healing received is never read', case: 'healing-received', edits: [['src/core/hunt/heal-cut.js', '  const pm = cut > 0 ? healInPm(inst, u) : 0;', '  const pm = 0;']] },
  { name: 'a ward raises every ally', case: 'healing-received', edits: [[TR, '  if ((u.shield | 0) > 0 && Number.isInteger(u.shieldBy) && inst && inst.world) {', '  if (inst && inst.world) {']] },
  { name: 'the healing received has no cap', case: 'healing-received', edits: [[TR, '  return Math.max(-TALENT_RULES.healInCapPm, Math.min(TALENT_RULES.healInCapPm, pm));', '  return pm;']] },
  { name: 'a party shell ignores its limit', case: 'targeting', edits: [[CT, '  const n = row.fx && row.fx.limit > 0 ? row.fx.limit : 0;\n  if (!n) return all;', '  return all;']] },
  { name: 'an ally row takes no second target', case: 'targeting', edits: [[CT, '  return [t, ...allyOrder(inst, u, row, allies(inst, u).filter(ok)).slice(0, n)];', '  return [t];']] },
  { name: 'an area pick takes every monster', case: 'targeting', edits: [[CT, "  if (!(row.fx && row.fx.pick === 'target')) return () => true;", '  return () => true;']] },
  { name: 'the reach never grows', case: 'targeting', edits: [[CT, '+ (row.fx && row.fx.range > 0 ? row.fx.range : 0);', '+ 0;']] },
  { name: 'no second ally', case: 'targeting', edits: [[HR, '  if (fx.alsoPm > 0) {', '  if (false) {']] },
  { name: 'per-target output is never read', case: 'per-target-output', edits: [[TR, '  for (const k of Object.keys(ON_TARGET)) if (Number.isInteger(fx[k]) && ON_TARGET[k](inst, u, t)) pm += fx[k];', '']] },
  { name: 'a branch\'s status strength is lost', case: 'status-strength', edits: [[SE, '  return v && POWERED.has(field) && Number.isInteger(st.pw) ? Math.trunc((v * st.pw) / 1000) : v;', '  return v;']] },
  { name: 'a patch lays nothing', case: 'status-strength', edits: [[STS, '    for (const m of units) if (inPatch(unit, m, st, row.ground.r)) applyStatus(inst, m, laid, { u: unit.id, maxHit: 1, runeTier: 1 }, sc);', '']] },
  { name: 'no second status', case: 'status-strength', edits: [[CT, '  if (!fx.also || m.alive !== true) return;', '  return;']] },
  { name: 'the first moment shuts the queue', case: 'reactions', edits: [['src/core/hunt/react-queue.js', '  if (!inst || inst.reacting || !reactsOn(u, on)) return;', '  if (!inst || inst.reacting || !reactsOn(u, on)) return;\n  inst.reacting = true;']] },
  { name: 'a reaction sets off another', case: 'reactions', edits: [['src/core/hunt/react-queue.js', '  if (!inst || inst.reacting || !reactsOn(u, on)) return;', '  if (!inst || !reactsOn(u, on)) return;']] },
  { name: 'a melee filter reads any hit', case: 'reactions', edits: [[DM, 'melee: isMonster(source) && cheb(source, target) <= 1,', 'melee: false,']] },
  { name: 'a reaction ignores its clock', case: 'reactions', edits: [[RX, '  if (row.clockMs && readyAt(u.cds, key) > sc.atMs) return;\n', '']] },
  { name: 'a free cast costs its mana', case: 'reactions', edits: [[AB, '    const mana = react && react.free ? 0 : manaOn(inst, hero, v.mana);', '    const mana = manaOn(inst, hero, v.mana);']] },
  { name: 'a reaction reads every move', case: 'reactions', edits: [[RX, '  if (row.of && ctx.ability !== row.of) return;\n', '']] },
  { name: 'a taunt lost queues nothing', case: 'reactions', edits: [[TG, "  if (was && m.holdMs > 0 && isHero(was) && was.alive === true) queueOn(inst, was, 'taunt_lost', { m });\n", '']] },
  { name: 'a cut has no cap', case: 'cooldown-reset-cap', edits: [[RX, '  const next = Math.max(atMs, orig - capMs, ready - ms);', '  const next = Math.max(atMs, ready - ms);']] },
  { name: 'a new cast keeps the old cycle', case: 'cooldown-reset-cap', edits: [[RX, '  const orig = readyAt(u.cds, key) >= ready ? readyAt(u.cds, key) : ready;', '  const orig = Number.isInteger(u.cds[key]) ? u.cds[key] : ready;']] },
  { name: 'no mana back near the line', case: 'mana-returns', edits: [[HR, '  if (fx.manaBackNearPm > 0 && cast.near && cast.spent > 0)', '  if (false)']] },
  { name: 'a ward never recasts over its own', case: 'mana-returns', edits: [[AB, "  if (!(row.fx && row.fx.refund === true) || !shells(row) || !a || a.alive !== true || !isAlly(hero, a) || a.shieldBy !== hero.id) return false;", '  return false;']] },
  { name: 'stillness never counts', case: 'mana-returns', edits: [[AB, "  if (u.stillMs > 0 && u.stillRegenPm > 0 && atMs - readyAt(u.cds, '~cast') >= u.stillMs)", '  if (false)']] },
  { name: 'a second hit lands at once', case: 'echo-and-carry', edits: [[STS, '  const every = once ? ms : row.everyMs;', '  const every = once ? 100 : row.everyMs;']] },
  { name: 'an overkill carries uncapped', case: 'echo-and-carry', edits: [[RX, ', Math.floor((int(dead && dead.maxHp) * row.capPm) / 1000));', ', 1e9);']] },
  { name: 'an exact amount goes through the chain', case: 'echo-and-carry', edits: [[DM, '  if (ability && ability.exact === true) return landOn(inst, target, source, Math.max(1, Math.floor(amount)), true);\n', '']] },
  { name: 'Hold Fast holds nothing', case: 'unit-rules', edits: [[TG, '  return inReachOf(inst, k, row).filter((m) => !lockedOn(unitById(inst, m.target)));', '  return inReachOf(inst, k, row);']] },
  { name: 'the guard takes no share', case: 'unit-rules', edits: [[DM, '  const g = exact ? null : guardFor(inst, target, source);', '  const g = null;']] },
  { name: 'the full hold is never written', case: 'unit-rules', edits: [[TR, '  if (ch && ch.holdAll) u.tauntFull = true; else if (u.tauntFull !== undefined) delete u.tauntFull;', '  if (u.tauntFull !== undefined) delete u.tauntFull;']] },
  { name: 'a mapped row stays a held rule', case: 'every-option-playable', edits: [['src/data/talents.js', "[mod('spring_tide', { cleanse: 1 })]", "[rule('cleanse')]"]] },
];

/* the suite: cases on the repo, each mutant on a planted copy must be caught (h1/h2's rule) */
const R = makeReport('talent-effects');
const M0 = await load(ROOT);
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = await fn(M0); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
if (!process.argv.includes('--no-mutants')) for (const mu of mutants) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits, ['src/render', 'supabase/functions/hr-accrue', 'tests/hunt-core/fixtures']);
  try {
    let why = null;
    try { why = await cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
