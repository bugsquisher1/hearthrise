// tests/hunt-core/status-effects.mjs — THE GENERAL STATUS SYSTEM, AURAS AND SHIELDS (lane/e2-e3-statuses, E2 + E3). Run by run-all.mjs.
//
// Every case plays the one engine's own functions (src/core/hunt/status.js, status-effects.js, damage.js, shields.js, auras.js,
// danger.js powerPm), so a viewed hunt and a closed one read the same thing; the migration of Bleed, Chill and Sickness is held by
// engine-parity.mjs (identical) and status.mjs.
//   rows-valid          the shipped rows, keys and auras are valid; a row breaking each rule is refused (statuses.js, auras.js, abilities.js)
//   poison-ticks        Poison ticks six times as poison damage beside Bleed, a dot
//   armor-break         a monster under Armor Break keeps 25% less of its defence against a blow
//   dealt-and-taken     Weakened deals 8% less, Emboldened 10% more, Guarded takes 10% less; keys sum (Sickness + Guarded = whole)
//   keys-combine        a planted pair on one `strongest` key: the larger counts alone, the stronger landing replaces the weaker and
//                       never the reverse; a planted pair on an `add` key adds, held to the key's cap
//   heal-over-time      Renewing heals its tick a second, never past max HP, as a `heal` naming the status
//   burning-ground      a patch hits every enemy within its r of its tile each second, never an ally; a fourth patch drops the oldest;
//                       a settle cut mid-patch resumes it (world-state round trip)
//   shield-rule         one shield a hero, a bigger one replaces it, a smaller one lands nothing; a blow that spends it says
//                       `shield_break` naming its caster; a heal's overflow is kept as a shield (overShieldPm)
//   aura-party-rule     an aura move slotted on a bar (planted row) puts its ledger row on every living ally in its radius, counted once
//                       a key a party (two wearers, never twice); the engine's power step reads it on the scale; it is never cast
//
// mutant-anchors: src/core/hunt/status.js src/core/hunt/status-effects.js src/core/hunt/damage.js src/core/hunt/shields.js src/core/hunt/auras.js src/core/hunt/danger.js src/core/hunt/abilities.js src/data/statuses.js src/data/auras.js
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadCore, plant, makeReport, ROOT, hero, mon, world, instOf } from './fixtures/h1.js';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';

async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + sourceQuery(root));
  M.ST = await imp('src/data/statuses.js');
  M.AU = await imp('src/data/auras.js');
  M.AD = await imp('src/data/abilities.js');
  M.fx = await imp('src/core/hunt/status-effects.js');
  M.sh = await imp('src/core/hunt/shields.js');
  M.aur = await imp('src/core/hunt/auras.js');
  M.ledger = await imp('src/core/power-ledger.js');
  M.ledgerData = await imp('src/data/power-ledger.js');
  M.dangerData = await imp('src/data/danger.js');
  return M;
}

/* A copy of `root`'s src/core and src/data with rows added (a test table the shipped data does not hold), loaded; the copy is the root a
   mutant planted, so the case still reads the mutant. */
async function withRows(M, edits, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'status-fx-'));
  try {
    for (const d of ['src/core', 'src/data']) cpSync(join(M.root, d), join(dir, d), { recursive: true, filter: (f) => !/\.(png|webp)$/i.test(f) });
    cpSync(join(M.root, 'src/build-info.js'), join(dir, 'src/build-info.js'));
    for (const [file, from, to] of edits) {
      const p = join(dir, file), s = readFileSync(p, 'utf8');
      if (s.split(from).length !== 2) throw new Error('withRows: ' + file + ' lacks one ' + from.slice(0, 50));
      writeFileSync(p, s.replace(from, () => to));
    }
    return await fn(await load(dir));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const rec = (M, seed) => {
  const events = [];
  return { atMs: 0, dtMs: 100, swing: 0, rng: M.rng.createRng(M.rng.hashSeed('status-fx', seed || 1)), events, emit: (e) => events.push(e), track: () => {} };
};
const of = (sc, type) => sc.events.filter((e) => e.type === type);
const run = (M, inst, sc, from, n) => { for (let i = from; i < from + n; i++) { sc.atMs = i * 100; M.status.tickStatuses(inst, sc); } };
const big = { hp: 1e6, maxHp: 1e6 };
const put = (M, inst, u, id, src, sc) => M.status.applyStatus(inst, u, M.ST.STATUSES[id], src || { u: null }, sc);

const cases = {
  'rows-valid': (M) => {
    const bad = [...M.ST.validate(), ...M.AU.validate()];
    if (bad.length) return bad.join('; ');
    for (const id of ['poison', 'burning_ground', 'guarded', 'emboldened', 'renewing']) {
      const r = M.ST.STATUSES[id];
      if (!r || r.hidden !== true) return 'the E2 row ' + id + ' is missing or not hidden';
    }
    /* (lane/roads-wave3) the E2 rows Roads options lay are shown, so a bar may test them (tests/hunt-core/talents.mjs bar-can-test) */
    for (const id of ['armor_break', 'weakened', 'silenced']) if (!M.ST.STATUSES[id] || M.ST.STATUSES[id].hidden) return 'the E2 row ' + id + ' is missing or hidden';
    const refused = (row, o, why) => (M.ST.validateStatus(Object.assign({}, row, o)).length ? null : why);
    const S = M.ST.STATUSES;
    return refused(S.burning_ground, { refresh: 'restart' }, 'a ground patch that restarts passed')
      || refused(S.burning_ground, { takenPm: 100 }, 'a ground patch with an effect on its holder passed')
      || refused(S.weakened, { key: 'nope' }, 'an unknown stacking key passed')
      || refused(S.armor_break, { armorPm: 0 }, 'a zero armorPm passed')
      || refused(S.renewing, { damageType: 'physical' }, 'a tick that heals and hurts passed')
      || refused(S.silenced, { silence: false }, 'silence false passed')
      || refused(S.chill, { tick: [1, 1], everyMs: 1000, blowPm: 10, damageType: 'frost' }, 'a ticking slow passed')
      || refused(S.sickness, { bogus: 1 }, 'an unknown status field passed')
      || refused(S.sickness, {}, null)
      || (M.ST.validate(Object.assign({}, S, { sick2: Object.assign({}, S.sickness, { id: 'sick2', maxStacks: 2 }) })).some((p) => /stacking key monster_takes_more/.test(p)) ? null : 'two rows of one key that stack differently passed')
      || (M.AU.validate({ x: { ...M.AU.AURAS.open_fire, id: 'x', radius: 0 } }).length ? null : 'an aura of radius 0 passed')
      || (M.AD.validate(Object.assign({}, M.AD.ABILITIES, { t_fire: { id: 't_fire', n: 'T', disciplines: ['restoration'], lane: 'heal', cdMs: 1000, mana: 4, ammo: 0, magicXpMult: 0, target: 'aura', aura: 'open_fire' } })).some((p) => /t_fire: an aura move lands nothing and costs nothing/.test(p)) ? null : 'an aura move that costs mana passed');
  },
  'poison-ticks': (M) => {
    const m = mon(M, 2, 0, 5, 3, big);
    const inst = instOf(M, world(M, [hero(M, 1, 4, 3), m]));
    const sc = rec(M, 2);
    put(M, inst, m, 'poison', { u: 1, maxHit: 100, runeTier: 1 }, sc);
    put(M, inst, m, 'bleed', { u: 1, maxHit: 100, runeTier: 1 }, sc);
    run(M, inst, sc, 0, 60);
    const p = of(sc, 'status_tick').filter((e) => e.status === 'poison');
    const dots = of(sc, 'dmg').filter((e) => e.ability === 'poison' && e.dot && e.element === 'poison');
    return p.length === 6 && dots.length === 6 && of(sc, 'status_tick').filter((e) => e.status === 'bleed').length === 6 ? null
      : 'poison ticked ' + p.length + ' times (' + dots.length + ' poison dots) beside bleed';
  },
  'armor-break': (M) => {
    const tough = Object.assign({}, M.MONSTERS, { rat: Object.assign({}, M.MONSTERS.rat, { def: 1000 }) });
    const red = M.C.defenceReduction(tough.rat);
    const rng = { chance: () => false, int: (a) => a };
    const go = (broken) => {
      const m = mon(M, 2, 0, 5, 3, big), h = hero(M, 1, 4, 3, { maxHit: 10 });
      const inst = Object.assign(instOf(M, world(M, [h, m])), { monsters: tough });
      if (broken) put(M, inst, m, 'armor_break', null, rec(M, 3));
      return M.damage.hurt(inst, m, 500, h, null, null, rng).dmg;
    };
    const plain = go(false), broken = go(true);
    const want = red - Math.floor((red * 750) / 1000);
    return red > 0 && broken - plain === want ? null : 'Armor Break moved a blow by ' + (broken - plain) + ' (defence ' + red + '), want ' + want;
  },
  'dealt-and-taken': (M) => {
    const blow = (srcIds, dstIds) => {
      const a = hero(M, 1, 4, 3, big), b = hero(M, 2, 5, 3, big);
      const inst = instOf(M, world(M, [a, b]));
      const sc = rec(M, 4);
      for (const id of srcIds) put(M, inst, a, id, null, sc);
      for (const id of dstIds) put(M, inst, b, id, null, sc);
      return M.damage.landHit(inst, sc, a, b, 1000, null, null).dmg;
    };
    const got = [blow([], []), blow(['weakened'], []), blow(['emboldened'], []), blow([], ['guarded']), blow([], ['sickness', 'guarded']), blow(['weakened'], ['sickness'])];
    return JSON.stringify(got) === JSON.stringify([1000, 920, 1100, 900, 1000, 1012]) ? null : 'plain, weakened, emboldened, guarded, sick + guarded, weakened at sick: ' + got;
  },
  'keys-combine': (M) => withRows(M, [
    ['src/data/statuses.js', "  heal_over_time: Object.freeze({ combine: 'add' }),\n", "  heal_over_time: Object.freeze({ combine: 'add' }),\n  t_mark: Object.freeze({ combine: 'strongest' }),\n"],
    ['src/data/statuses.js', '  /* ── HIDDEN: the engine', "  t_weak: Object.freeze({ id: 't_weak', name: 'T Weak', key: 't_mark', hidden: true, durationMs: 3000, maxStacks: 2, takenPm: 100 }),\n"
      + "  t_strong: Object.freeze({ id: 't_strong', name: 'T Strong', key: 't_mark', hidden: true, durationMs: 3000, maxStacks: 2, takenPm: 300 }),\n"
      + "  sick_strong: Object.freeze({ id: 'sick_strong', name: 'T Sick', key: 'monster_takes_more', hidden: true, durationMs: 6000, maxStacks: 1, takenPm: 200 }),\n"
      + "  guard_b: Object.freeze({ id: 'guard_b', name: 'T Guard', key: 'hero_takes_less', hidden: true, durationMs: 4000, maxStacks: 1, takenPm: -250 }),\n  /* ── HIDDEN: the engine"],
  ], (P) => {
    const m = mon(P, 2, 0, 5, 3, big), h = hero(P, 1, 4, 3, big);
    const inst = instOf(P, world(P, [h, m]));
    const sc = rec(P, 5);
    const on = (u, id) => P.status.applyStatus(inst, u, P.ST.STATUSES[id], { u: null }, sc);
    /* one strongest key, two rows, room for two stacks: the larger counts alone */
    on(m, 't_weak'); on(m, 't_strong');
    if (P.fx.effectPm(m, 'takenPm') !== 300) return 'a strongest key with 100 and 300 read ' + P.fx.effectPm(m, 'takenPm') + ', not 300';
    /* one stack a key: the stronger replaces the weaker; the weaker never replaces it, but restarts its time */
    on(m, 'sickness'); on(m, 'sick_strong');
    const sick = () => m.statuses.filter((st) => P.ST.STATUSES[st.s].key === 'monster_takes_more').map((st) => st.s + ':' + st.left).join();
    if (sick() !== 'sick_strong:6000') return 'Sickness then the stronger left ' + sick();
    run(P, inst, sc, 1, 10);
    on(m, 'sickness');
    if (sick() !== 'sick_strong:6000') return 'a weaker Sickness on the stronger left ' + sick() + ' (it must restart the time and keep the stronger)';
    if (P.fx.effectPm(m, 'takenPm') !== 500) return 'two keys did not add: ' + P.fx.effectPm(m, 'takenPm');
    /* an add key: two rows add, held to its cap (hero_takes_less 300) */
    on(h, 'guarded');
    if (P.fx.effectPm(h, 'takenPm') !== -100) return 'one Guarded read ' + P.fx.effectPm(h, 'takenPm');
    on(h, 'guard_b');
    const cap = P.ST.STATUS_KEYS.hero_takes_less.capPm;
    if (!(cap < 350)) return 'fixture: the hero_takes_less cap ' + cap + ' no longer bites on -100 and -250';
    return P.fx.effectPm(h, 'takenPm') === -cap ? null : 'Guarded and a second guard on an add key capped ' + cap + ' read ' + P.fx.effectPm(h, 'takenPm');
  }),
  'heal-over-time': (M) => {
    const h = hero(M, 1, 4, 3, { hp: 950, maxHp: 1000 });
    const inst = instOf(M, world(M, [h, mon(M, 2, 0, 9, 3)]));
    const sc = rec(M, 6);
    put(M, inst, h, 'renewing', { u: 7, maxHit: 100, runeTier: 1 }, sc);
    run(M, inst, sc, 0, 60);
    const heals = of(sc, 'heal').filter((e) => e.ability === 'renewing');
    /* blowPm 150 of a 100 blow: a 15 tick; 950 -> 965 -> 980 -> 995 -> 1000 (capped) and nothing past full */
    return h.hp === 1000 && heals.map((e) => e.amount).join() === '15,15,15,5' && heals.every((e) => e.u === 7 && e.t === 1) ? null
      : 'Renewing healed ' + heals.map((e) => e.amount) + ' to ' + h.hp;
  },
  'burning-ground': (M) => {
    const h = hero(M, 1, 4, 3, big), ally = hero(M, 5, 10, 3, big);
    const a = mon(M, 2, 0, 10, 4, big), b = mon(M, 3, 0, 11, 2, big), far = mon(M, 4, 0, 12, 3, big);
    let w = world(M, [h, a, b, far, ally]);
    const sc = rec(M, 7);
    const row = M.ST.STATUSES.burning_ground;
    M.status.applyStatus(instOf(M, w), h, row, { u: 1, maxHit: 100, runeTier: 1, at: [10, 3] }, sc);
    for (let i = 0; i < 45; i++) { if (i === 17) w = M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(w)))); sc.atMs = i * 100; M.status.tickStatuses(instOf(M, w), sc); }
    const hit = (id) => of(sc, 'dmg').filter((e) => e.t === id && e.ability === 'burning_ground').length;
    if (hit(2) !== 4 || hit(3) !== 4 || hit(4) !== 0 || hit(5) !== 0 || hit(1) !== 0) return 'a 4 s patch at (10, 3) r 1 hit ' + [2, 3, 4, 5, 1].map(hit) + ' (in, in, out, ally, holder)';
    const holder = w.units[0];
    if (holder.statuses.length) return 'a burnt-out patch stayed on its holder';
    const sc2 = rec(M, 8);
    for (let i = 0; i < 4; i++) M.status.applyStatus(instOf(M, w), holder, row, { u: 1, maxHit: 100, runeTier: 1, at: [10 + i, 3] }, sc2);
    const at = holder.statuses.map((st) => st.at[0]).join();
    return at === '11,12,13' ? null : 'four patches, three at most, left patches at x ' + at;
  },
  'shield-rule': (M) => {
    const a = hero(M, 1, 4, 3, big), b = hero(M, 2, 5, 3, big), m = mon(M, 3, 0, 6, 3, big);
    const inst = instOf(M, world(M, [a, b, m]));
    const sc = rec(M, 9);
    if (!M.sh.offerShield(sc, a, b, 50) || b.shield !== 50 || b.shieldBy !== 1) return 'a first shield did not land';
    if (M.sh.offerShield(sc, b, b, 40) || b.shield !== 50 || b.shieldBy !== 1) return 'a smaller shield replaced a bigger one';
    if (!M.sh.offerShield(sc, b, b, 60) || b.shield !== 60 || b.shieldBy !== 2) return 'a bigger shield did not replace';
    if (of(sc, 'shield').length !== 2) return 'a shield that did not land said so';
    M.damage.landHit(inst, sc, m, b, 30, null, null);
    if (of(sc, 'shield_break').length) return 'a chipped shield said it broke';
    M.damage.landHit(inst, sc, m, b, 30, null, null);
    const br = of(sc, 'shield_break');
    if (br.length !== 1 || br[0].t !== 2 || br[0].by !== 2 || br[0].u !== 3) return 'a spent shield said ' + JSON.stringify(br);
    M.damage.landHit(inst, sc, m, b, 30, null, null);
    if (of(sc, 'shield_break').length !== 1) return 'a blow with no shield said one broke';
    /* a heal's overflow at 500 permille: 300 short of full, a 700 heal keeps 200 */
    const c = hero(M, 4, 7, 3, { hp: 700, maxHp: 1000 });
    if (M.sh.overflowShield(sc, a, c, 700, 300, 500) !== 200 || c.shield !== 200) return 'a heal\'s overflow kept ' + c.shield + ', not 200';
    return M.sh.overflowShield(sc, a, c, 100, 300, 500) === 0 ? null : 'a heal with no overflow kept a shield';
  },
  'aura-party-rule': (M) => withRows(M, [
    ['src/data/abilities.js', "  ab({ id: 'mend', n: 'Mend',", "  ab({ id: 't_fire', n: 'T Fire', disciplines: ['restoration'], lane: 'heal', cdMs: 1000, mana: 0, target: 'aura', aura: 'open_fire', magicXpMult: 0 }),\n  ab({ id: 'mend', n: 'Mend',"],
  ], (P) => {
    const bad = P.AD.validate();
    if (bad.length) return 'the planted aura move: ' + bad.join('; ');
    const aura = P.AU.AURAS.open_fire;
    /* (heroLv and gearPm are the settle's, never persisted: set on the unit after it is made) */
    const H = (id, x) => Object.assign(hero(P, id, x, 3, big), { heroLv: 200, gearPm: 1000 * P.dangerData.DANGER_GROUNDS.muster_barrows.gearLevel });
    const wearer = H(1, 4), near = H(2, 4 + aura.radius), out = H(3, 5 + aura.radius), second = H(4, 5);
    const rat = mon(P, 9, 0, 6, 3, big);
    const slot = (id) => ({ slot: { id: 's', join: 'and', conditions: [], action: { type: 'ability', id } } });
    const mk = (heroes) => ({ world: { risk: 'steady', units: [wearer, near, out, second, rat] }, ground: { id: 'muster_barrows' }, monsters: P.MONSTERS, tier: null, heroes });
    const one = mk({ 1: { slots: [slot('t_fire')] }, 2: { slots: [] }, 3: { slots: [] }, 4: { slots: [] } });
    const steps = (inst, u) => P.ledger.ledgerSteps(u, 'offense', P.aur.auraRowsOn(inst, u));
    const cap = P.ledger.sliceCap(aura.slice, 200);
    if (steps(one, near) !== aura.steps || steps(one, out) !== 0 || steps(one, wearer) !== Math.min(cap, aura.steps)) return 'one Open Fire put ' + [steps(one, wearer), steps(one, near), steps(one, out)] + ' steps on wearer, ally in reach, ally out of it';
    if (P.aur.auraRowsOn(one, rat).length) return 'an aura reached a monster';
    /* two fires of one key: an ally in reach of both counts one */
    const two = mk({ 1: { slots: [slot('t_fire')] }, 2: { slots: [] }, 3: { slots: [] }, 4: { slots: [slot('t_fire')] } });
    if (steps(two, near) !== aura.steps) return 'two Open Fires counted ' + steps(two, near) + ' steps on one ally, not ' + aura.steps;
    /* a dead wearer wears nothing */
    wearer.alive = false; second.alive = false;
    const dead = steps(mk({ 1: { slots: [slot('t_fire')] }, 2: { slots: [] }, 3: { slots: [] }, 4: { slots: [] } }), near);
    wearer.alive = true; second.alive = true;
    if (dead !== 0) return 'a dead wearer\'s aura held: ' + dead;
    /* the engine's power step reads it on the scale (danger.js powerPm through damage.js hurt) */
    const rng = { chance: () => false, int: (a) => a };
    const blow = (inst) => P.damage.hurt(inst, { ...rat, alive: true, hp: 1e9, maxHp: 1e9 }, 100000, near, null, null, rng).dmg;
    const ratio = blow(one) / blow(mk({}));
    if (Math.abs(ratio - Math.pow(1 + P.dangerData.DANGER.powerStep, aura.steps)) > 6e-4) return 'the power step read an aura x' + ratio + ', not ' + aura.steps + ' steps';
    /* an ALLY'S aura row never takes room in its own cap: an ally whose own build slice is full still gets the aura whole */
    near.ledger = [{ slice: 'build', raises: 'offense', steps: cap, key: 'own' }];
    const full = steps(one, near);
    near.ledger = undefined;
    if (full !== cap + aura.steps) return 'an ally with a full build slice read ' + full + ' steps, not ' + (cap + aura.steps) + ' (the aura took room in its cap)';
    /* never cast: a bar of only the aura move fires nothing and never waits (no rule_wait for a move that has no target to find) */
    const sc = rec(P, 10);
    const cast = mk({ 1: { slots: [Object.assign(slot('t_fire'), { rule: 'r1' })], hs: {}, range: 1 } });
    Object.assign(cast, { grid: null, occ: null });
    const pick = P.abilities.firstUsable(cast, wearer, sc);
    return pick === null && !of(sc, 'rule_wait').length ? null : 'an aura move was tested to cast: ' + JSON.stringify(pick || of(sc, 'rule_wait'));
  }),
};

const mutants = [
  { name: 'an add key ignores its cap', case: 'keys-combine', edits: [['src/core/hunt/status-effects.js', '    total += Number.isInteger(cap) && Math.abs(v) > cap ? Math.sign(v) * cap : v;', '    total += v;']] },
  { name: 'a strongest key sums its stacks', case: 'keys-combine', edits: [['src/core/hunt/status-effects.js', '    if (was === undefined || Math.abs(v) > Math.abs(was)) keys.set(slot, v);', '    keys.set(slot, (was || 0) + v);']] },
  { name: 'a weaker landing replaces a stronger stack', case: 'keys-combine', edits: [['src/core/hunt/status.js', '      if (weak && strength(row, scale) > strength(rowOf(weak), weak.scale)) {', '      if (weak) {']] },
  { name: 'refresh counts the row, not the key', case: 'keys-combine', edits: [['src/core/hunt/status.js', ": (st) => rowOf(st).key === row.key);", ': (st) => st.s === row.id);']] },
  { name: 'a ground patch never drops the oldest', case: 'burning-ground', edits: [['src/core/hunt/status.js', '    if (list.filter(mine).length >= row.maxStacks) { const old = list.find(mine); list = list.filter((st) => st !== old); }\n', '']] },
  { name: 'a ground patch reaches one tile further', case: 'burning-ground', edits: [['src/core/hunt/status.js', 'cheb(m, { x: st.at[0], y: st.at[1] }) > r)', 'cheb(m, { x: st.at[0], y: st.at[1] }) > r + 1)']] },
  { name: 'a ground patch burns allies', case: 'burning-ground', edits: [['src/core/hunt/status.js', "if (m.alive !== true || !isEnemy(unit, m) || ", "if (m.alive !== true || m === unit || "]] },
  { name: 'a heal tick overheals', case: 'heal-over-time', edits: [['src/core/hunt/status.js', 'Math.min(healIn(inst, unit, n), Math.floor(Number(unit.maxHp) || 0) - Math.floor(Number(unit.hp) || 0))', 'healIn(inst, unit, n)']] },
  { name: 'a heal tick hurts', case: 'heal-over-time', edits: [['src/core/hunt/status.js', '    unit.hp = Math.floor(Number(unit.hp) || 0) + got;', '    unit.hp = Math.floor(Number(unit.hp) || 0) - got;']] },
  { name: 'Armor Break never reads', case: 'armor-break', edits: [['src/core/hunt/damage.js', "  const pm = red > 0 ? effectPm(target, 'armorPm') : 0;", '  const pm = 0;']] },
  { name: 'a dealer\'s status deals nothing', case: 'dealt-and-taken', edits: [['src/core/hunt/damage.js', "  const dealtPm = source ? effectPm(source, 'dealtPm') : 0;", '  const dealtPm = 0;']] },
  { name: 'a negative takenPm is dropped', case: 'dealt-and-taken', edits: [['src/core/hunt/status-effects.js', '    if (!v) continue;', '    if (!(v > 0)) continue;']] },
  { name: 'Poison deals physical', case: 'poison-ticks', edits: [['src/data/statuses.js', "blowPm: 20, tierPermille: TIERS, damageType: 'poison' }", "blowPm: 20, tierPermille: TIERS, damageType: 'physical' }"]] },
  { name: 'a smaller shield replaces a bigger one', case: 'shield-rule', edits: [['src/core/hunt/shields.js', '  if (!t || t.alive !== true || !(n > int(t.shield))) return false;', '  if (!t || t.alive !== true) return false;']] },
  { name: 'a spent shield never says it broke', case: 'shield-rule', edits: [['src/core/hunt/damage.js', '  if (shieldBy !== undefined && r.absorbed > 0 && !(target.shield > 0)) {', '  if (shieldBy !== undefined && r.absorbed > 0 && target.shield > 0) {']] },
  { name: 'a heal keeps its whole self as a shield', case: 'shield-rule', edits: [['src/core/hunt/shields.js', '  const over = int(n) - Math.max(0, int(missing));', '  const over = int(n);']] },
  { name: 'an aura reaches past its radius', case: 'aura-party-rule', edits: [['src/core/hunt/auras.js', '      if (d > a.radius) continue;\n', '']] },
  { name: 'a dead wearer keeps its aura', case: 'aura-party-rule', edits: [['src/core/hunt/auras.js', '    if (w.alive !== true || (w !== unit && !isAlly(w, unit))) continue;', '    if (w !== unit && !isAlly(w, unit)) continue;']] },
  { name: 'every aura row counts as worn', case: 'aura-party-rule', edits: [['src/core/hunt/auras.js', "scope: 'party', worn: w === unit });", "scope: 'party', worn: true });"]] },
  { name: 'the power step never reads an aura', case: 'aura-party-rule', edits: [['src/core/hunt/amount.js', "heroRows(source, 'offense', c).concat(auraRowsOn(inst, source))", "heroRows(source, 'offense', c)"]] },
  { name: 'an aura move is cast', case: 'aura-party-rule', edits: [['src/core/hunt/abilities.js', "    && !(ABILITIES[r.slot.action.id] && ABILITIES[r.slot.action.id].target === 'aura')\n", '']] },
];

const R = makeReport('hunt-core/status-effects');
const M = await load(ROOT);
for (const [name, fn] of Object.entries(cases)) {
  let why = null;
  try { why = await fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, name + ': ' + why);
}
for (const mu of mutants) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits);
  try {
    let why = null;
    try { why = await cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
