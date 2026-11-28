// tests/hunt-core/amount.mjs — THE AMOUNT PIPELINE: EVERY AMOUNT IN A FIGHT, IN STEPS (lane/stage3-pipeline; src/core/hunt/amount.js,
// src/data/amount.js; 27-formula-overhaul.md D-1 to D-8, 04-math-strategy.md sections 2, 3, 12 and 14). Run by run-all.mjs.
//
// The rules held here, each a case with mutants planted on a copy:
//   reference    the reference company on its ground's reference step is at a gap of 0: a hero's blow is its weapon's top share of the
//                ground Level's reference health, a monster's blow its row's blow x pressurePm, a heal its share of the healer's
//   slope        one tier of item Level on a whole kit is GEAR_STEPS.tierSteps steps on a blow at a monster and off a blow at the hero
//                (weightGear), half that under the base (weightGearBelow); armor reads a plain blow and ward an elemental one
//   scale        04 section 14's scale test, the pipeline's half: at a gap of 0 a heal and a monster's blow are the same SHARE of the
//                reference health at Levels 30, 300 and 3,000 (rounded once: within one point)
//   exact        stepsOf and ratioOf are exact inverses on whole steps, with no logarithm (the browser and the edge agree)
//   conditional  D-8 multipliers are steps: a weapon answer, a crit's mean, a mark, held to conditionalStepsMax together in the gear slice;
//                a resistance a whole cost; Tempering in its own slice
//   roll         one draw a blow, from (1000 - rollSpreadPm) to (1000 + rollSpreadPm) permille of the mean
//   switch       27 K-2: with AMOUNT.hitRoll a basic blow on the scale rolls today's to-hit, without it every blow lands; never off it
//   snapshot     a hero's snapshot carries the pipeline's reads (the weapon's top, the armor and ward gear parts), and the frozen peer too
//   reference    (refco) the monster formula's one door (src/core/reference-company.js refCompany) answers the pipeline's own output for a
//                ground on the scale: one share of a reference health a head a second at every Level, the blow reaching at pressurePm,
//                landing at the to-hit only while hitRoll holds; a Tower room (no refStep) keeps the old chain's measured table
//   imbue        (lane/tp-im-steps) worn imbuements are consumable rows on the blow: Brute Edge on a brute and not a swarm, Fire Ward on an
//                ember blow and not a plain one, each at its fire size (21 D-17), and a damage meal on top of three adds nothing (their room
//                fills the slice, 21 D-11); Fire Edge's conversion +2 on an Undead, a whole cost on a target that resists Fire (21 D-18),
//                and on a Fire blow it converts nothing and still takes its room (21 D-22)
//   leech        (lane/imbue-engine, 21 D-18) a worn Leech through damage.js landHit: a 30 HP swing at 19 permille (a band 50 Leech at Level 60
//                on the curve, D-21) pays 0, 1, 0, 1, 0 with the carry kept on
//                the unit, a status tick nothing, a Mana Leech's mana on the dmg event's `back`, nothing with nothing worn
//   temper-paths, imbue-paths   both paths: Temper 5 on every slot and three imbuements each change Muster's four through the real settle,
//                and 10-minute and 100-second windows play one hunt (a closed hunt and a viewed one)
//
// mutant-anchors: src/core/hunt/amount.js src/core/hunt/damage.js src/data/amount.js src/core/member.js src/core/imbue.js src/core/hunt/imbue-leech.js
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCore, plant, makeReport, ROOT, groundRow, gridOf, mon, world } from './fixtures/h1.js';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);
async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.amount = await imp('src/core/hunt/amount.js');
  M.amountData = (await imp('src/data/amount.js')).AMOUNT;
  M.dangerData = await imp('src/data/danger.js');
  M.ITEMS = (await imp('src/data/items.js')).ITEMS;
  M.refCo = await imp('src/core/reference-company.js');
  M.mformula = await imp('src/core/hunt/monster-formula.js');
  return M;
}

const G = 'muster_barrows';
/* an rng that always draws its lowest (a roll of 1000 - spread) and never lands a chance */
const LOW = Object.freeze({ chance: () => false, int: (a) => a });
const instOn = (risk, M) => ({ world: { risk, units: [] }, ground: { id: G }, monsters: M.MONSTERS, tier: null });
/* a hero whose ratings sit at Level L with gear part `g` (thousandths) and its skill on its line */
const heroAt = (L, g, o = {}) => ({ side: 'hero', id: 1, alive: true, heroLv: L, gearPm: g, armorGearPm: g, wardPm: g, skillGapPm: 0, blowBp: 740, ...o });
const rat = Object.freeze({ side: 'mon', id: 2, kind: 'rat', alive: true });
const refL = (M) => M.dangerData.DANGER_GROUNDS[G].refLevel;
const gearL = (M) => M.dangerData.DANGER_GROUNDS[G].gearLevel;

/* the gear part (thousandths) that puts a hero of Level Lpm at rating R under Lpm: the gap read at POWER.weightGearBelowPm (lane/tuning-pass:
   the weight is a lever, so the fixture reads it instead of assuming a half) */
const gearRating = (M, R, Lpm) => Lpm + Math.round(((R - Lpm) * 1000) / M.dangerData.POWER.weightGearBelowPm);
const cases = {
  reference(M) {
    const A = M.amount, D = M.amountData, inst = instOn('steady', M);
    if (!A.stepsOn(inst)) return 'CONTROL: the pipeline is off on ' + G + ' on Steady';
    if (A.stepsOn(instOn('', M))) return 'the pipeline is on off the scale';
    const L0 = refL(M), ref = heroAt(L0, 1000 * gearL(M));
    if (A.offensePm(ref) !== A.refRatingPm({ id: G })) return 'the reference company rates ' + A.offensePm(ref) + ', the ground\'s reference ' + A.refRatingPm({ id: G });
    const tr = {};
    const n = A.blowAmount(inst, { source: ref, target: rat, mean: 500, el: 1000, rng: LOW, trace: tr });
    const roll = 1000 - D.rollSpreadPm, want = Math.round(0.5 * (740 / 10000) * A.refHealth(L0) * (roll / 1000));
    if (tr.steps !== 0) return 'the reference blow reads ' + tr.steps + ' steps';
    if (n !== want) return 'the reference blow lands ' + n + ', want ' + want + ' (half the top of a ' + A.refHealth(L0) + ' reference health)';
    /* a hero 40 Levels up whose rating is the reference's (its kit under its Level) lands the same blow: a monster's reference health is its ground's */
    const R = A.refRatingPm({ id: G }), up = heroAt(L0 + 40, gearRating(M, R, 1000 * (L0 + 40)));
    if (A.offensePm(up) !== R) return 'CONTROL: the Level ' + (L0 + 40) + ' hero rates ' + A.offensePm(up);
    if (A.blowAmount(inst, { source: up, target: rat, mean: 500, el: 1000, rng: LOW }) !== want) return 'a hero at the reference rating 40 Levels up lands a different blow (its own Level read)';
    const t2 = {};
    const m = A.blowAmount(inst, { source: rat, target: ref, mean: 100, el: 1000, rng: LOW, trace: t2 });
    if (t2.steps !== 0 || m !== Math.round(100 * (D.pressurePm / 1000) * (roll / 1000))) return 'a monster\'s blow at the reference hero lands ' + m + ' on ' + t2.steps + ' steps';
    const h = A.healAmount(inst, ref, 1000, { rng: LOW });
    if (h !== Math.round((740 / 10000) * A.refHealth(L0) * (roll / 1000))) return 'a heal of one top lands ' + h;
    return null;
  },
  slope(M) {
    const A = M.amount, inst = instOn('steady', M), { GEAR_STEPS, POWER } = M.dangerData;
    const L0 = refL(M), g0 = 1000 * gearL(M), T = GEAR_STEPS.tierSteps;
    const steps = (from, to) => { const t = {}; A.blowAmount(inst, { source: from, target: to, mean: 1000, el: 1000, rng: LOW, trace: t }); return t.steps; };
    const up = Math.round((T * POWER.weightGearPm) / 1000), dn = Math.round((T * POWER.weightGearBelowPm) / 1000);
    if (steps(heroAt(L0, g0 + 1000 * T), rat) !== up) return 'a tier of gear over the base is ' + steps(heroAt(L0, g0 + 1000 * T), rat) + ' steps at a monster, not ' + up;
    if (steps(heroAt(L0, g0 - 1000 * T), rat) !== -dn) return 'a tier of gear under the base is ' + steps(heroAt(L0, g0 - 1000 * T), rat) + ' steps, not ' + -dn;
    if (steps(rat, heroAt(L0, g0 + 1000 * T)) !== -up) return 'a tier of armor is ' + steps(rat, heroAt(L0, g0 + 1000 * T)) + ' steps at the hero, not ' + -up;
    /* armor answers a plain blow, ward an elemental one */
    const plate = heroAt(L0, g0, { armorGearPm: g0 + 1000 * T, wardPm: g0 });
    const t = {}, w = {};
    A.blowAmount(inst, { source: rat, target: plate, mean: 1000, el: 1000, rng: LOW, trace: t });
    A.blowAmount(inst, { source: rat, target: plate, mean: 1000, el: 1000, ward: true, rng: LOW, trace: w });
    if (t.steps !== -up || w.steps !== 0) return 'armor and ward read ' + t.steps + ' and ' + w.steps + ' steps, not ' + -up + ' and 0';
    /* the split: a heavy piece spends more of its item Level on armor, a light one on ward, a medium one evenly */
    const sp = M.amountData.defenseSplit;
    if (!(sp.heavy.armorSteps > sp.heavy.wardSteps && sp.light.wardSteps > sp.light.armorSteps && sp.medium.armorSteps === sp.medium.wardSteps)) return 'the armor and ward split is not heavy-armor, light-ward, medium-even';
    const heavy = Object.keys(M.ITEMS).find((id) => M.ITEMS[id].slot === 'body' && M.ITEMS[id].armourClass === 'plate' && M.ITEMS[id].reqLv > 10);
    const light = Object.keys(M.ITEMS).find((id) => M.ITEMS[id].slot === 'body' && M.ITEMS[id].armourClass === 'cloth' && M.ITEMS[id].reqLv > 10);
    if (!heavy || !light) return 'CONTROL: no plate or cloth body piece';
    const dh = A.defenseGearPm({ body: heavy }, M.ITEMS), dl = A.defenseGearPm({ body: light }, M.ITEMS);
    if (!(dh.armorPm > dh.wardPm) || !(dl.wardPm > dl.armorPm)) return 'a plate body splits ' + JSON.stringify(dh) + ', a cloth one ' + JSON.stringify(dl);
    /* in steps: the same plate 100 item Levels up keeps the same armor over ward (a share would grow) */
    const W = M.dangerData.GEAR_STEPS.slotPm.body, lv = M.ITEMS[heavy].iL; /* (its item Level, not its wear: 12-targets 8.3 wears a piece 10 under it) */
    if (dh.armorPm - dh.wardPm !== W * (sp.heavy.armorSteps - sp.heavy.wardSteps) || dh.armorPm !== W * (lv + sp.heavy.armorSteps)) return 'a plate body\'s split is not its steps on its item Level: ' + JSON.stringify(dh);
    return null;
  },
  scale(M) {
    const A = M.amount, inst = instOn('steady', M), L0 = refL(M), R = A.refRatingPm({ id: G });
    const shares = [];
    for (const L of [30, 300, 3000]) {
      /* a hero at Level L, its kit and skill at its Level (a gap of 0 on its own heal) */
      const healer = heroAt(L, 1000 * L);
      const heal = A.healAmount(inst, healer, 1000, { rng: LOW }) / A.refHealth(L);
      /* a monster's blow at a hero whose armor rating is the ground's reference (a gap of 0): its share of that hero's reference health */
      const g = L * 1000 >= R ? gearRating(M, R, 1000 * L) : R;
      const target = heroAt(L, g, { armorGearPm: g });
      const tr = {};
      const hit = A.blowAmount(inst, { source: rat, target, mean: 1000, el: 1000, rng: LOW, trace: tr }) / A.refHealth(L);
      if (tr.steps !== 0) return 'CONTROL: the blow at the Level ' + L + ' hero reads ' + tr.steps + ' steps';
      shares.push([L, heal, hit, 1 / A.refHealth(L)]);
    }
    for (const [L, heal, hit, pt] of shares) {
      if (Math.abs(heal - shares[0][1]) > pt + 1 / A.refHealth(30)) return 'a heal at a gap of 0 is ' + heal + ' of the reference health at Level ' + L + ', ' + shares[0][1] + ' at 30';
      /* (a monster's row number is a share of the ground's Level's health: at Level L it reads that share of L's) */
      const want = (1000 * (M.amountData.pressurePm / 1000) * ((1000 - M.amountData.rollSpreadPm) / 1000)) / A.refHealth(L0);
      if (Math.abs(hit - want) > pt) return 'a monster\'s blow at a gap of 0 is ' + hit + ' of the hero\'s reference health at Level ' + L + ', want ' + want;
    }
    return null;
  },
  exact(M) {
    const A = M.amount, s = 1 + M.dangerData.DANGER.powerStep;
    for (let n = -400; n <= 400; n++) if (A.stepsOf(A.ratioOf(n)) !== n) return 'stepsOf(ratioOf(' + n + ')) is ' + A.stepsOf(A.ratioOf(n));
    /* the NEAREST step: a hair under a whole step reads that step, not the one below */
    for (let n = -50; n <= 50; n++) if (A.stepsOf(A.ratioOf(n) / 1.0001) !== n) return 'a hair under ' + n + ' steps reads ' + A.stepsOf(A.ratioOf(n) / 1.0001);
    let p = 1;
    for (let n = 0; n <= 60; n++, p *= s) if (Math.abs(A.ratioOf(n) / p - 1) > 1e-12) return 'ratioOf(' + n + ') is ' + A.ratioOf(n) + ', not ' + p;
    /* the nearest whole step: x1.2 is 52 steps at 0.35% (1.0035^52 = 1.199) */
    if (A.stepsOf(1.2) !== Math.round(Math.log(1.2) / Math.log(s))) return 'stepsOf(1.2) is ' + A.stepsOf(1.2);
    if (A.stepsOf(1) !== 0 || A.stepsOf(0) !== 0 || A.stepsOf(-1) !== 0) return 'stepsOf of 1, 0 or a negative is not 0';
    return null;
  },
  conditional(M) {
    const A = M.amount, inst = instOn('steady', M), CAP = M.dangerData.GEAR_STEPS.conditionalStepsMax;
    const L0 = refL(M), ref = heroAt(L0, 1000 * gearL(M));
    const steps = (c) => { const t = {}; A.blowAmount(inst, { source: ref, target: rat, mean: 1000, el: 1000, rng: LOW, critMult: 1.5, trace: t, ...c }); return t.steps; };
    const s12 = A.stepsOf(1.2);
    if (!(s12 > CAP)) return 'CONTROL: x1.2 is under the cap';
    if (steps({ answerPm: 1200 }) !== CAP) return 'a weapon answer of x1.2 is ' + steps({ answerPm: 1200 }) + ' steps, not held to ' + CAP;
    if (steps({ answerPm: 1050 }) !== A.stepsOf(1.05)) return 'a small answer is not its whole steps';
    /* a crit chance is its mean: 20% at x1.5 is x1.1; with an answer they share the gear slice's cap */
    const crit = { ...ref, critPm: 200 };
    const t = {};
    A.blowAmount(inst, { source: crit, target: rat, mean: 1000, el: 1000, rng: LOW, critMult: 1.5, trace: t });
    if (t.steps !== Math.min(CAP, A.stepsOf(1.1))) return 'a 20% crit at x1.5 is ' + t.steps + ' steps, not ' + Math.min(CAP, A.stepsOf(1.1));
    const both = {};
    A.blowAmount(inst, { source: crit, target: rat, mean: 1000, el: 1000, rng: LOW, critMult: 1.5, answerPm: 1100, trace: both });
    if (both.steps !== CAP) return 'a crit and an answer together read ' + both.steps + ' steps, past the gear slice\'s ' + CAP;
    /* a monster's resistance is a whole cost; its weakness a held gain */
    if (steps({ el: 800 }) !== A.stepsOf(0.8)) return 'a resistance of 800 is ' + steps({ el: 800 }) + ' steps, not ' + A.stepsOf(0.8) + ' whole';
    if (steps({ el: 1500 }) !== CAP) return 'a weakness of 1500 is ' + steps({ el: 1500 }) + ' steps, not held';
    /* a mark is a held gain on the target, a slow a held cost on the source */
    if (steps({ markPm: 400 }) !== CAP || steps({ markPm: 50 }) !== A.stepsOf(1.05)) return 'a mark reads ' + steps({ markPm: 400 }) + ' / ' + steps({ markPm: 50 });
    if (steps({ slowPm: 300 }) !== -CAP) return 'a slow reads ' + steps({ slowPm: 300 }) + ' steps on its unit\'s blow';
    /* the steady cut (a cape and a steady meal: armorPm) in the temper slice, held to its cap of 5 (CONFLICTS 2026-11-26 tp-im-steps) */
    const tc = 5, te = {}, t0 = {};
    A.blowAmount(inst, { source: rat, target: { ...ref, armorPm: 50 }, mean: 1000, el: 1000, rng: LOW, trace: te });
    A.blowAmount(inst, { source: rat, target: ref, mean: 1000, el: 1000, rng: LOW, trace: t0 });
    const cut = Math.round((t0.cond - te.cond) * 1000) / 1000;
    if (cut !== Math.min(tc, A.stepsOf(1000 / 950))) return 'a 5% steady cut is ' + cut + ' steps, not its slice\'s ' + Math.min(tc, A.stepsOf(1000 / 950));
    return null;
  },
  roll(M) {
    const A = M.amount, D = M.amountData, inst = instOn('steady', M), L0 = refL(M), ref = heroAt(L0, 1000 * gearL(M));
    const asked = [];
    const rng = { chance: () => false, int: (a, b) => { asked.push([a, b]); return b; } };
    const hi = A.blowAmount(inst, { source: ref, target: rat, mean: 500, el: 1000, rng });
    const lo = A.blowAmount(inst, { source: ref, target: rat, mean: 500, el: 1000, rng: LOW });
    if (asked.length !== 1 || asked[0][0] !== 1000 - D.rollSpreadPm || asked[0][1] !== 1000 + D.rollSpreadPm) return 'a blow drew ' + JSON.stringify(asked) + ', not one roll of +-' + D.rollSpreadPm;
    if (!(hi > lo)) return 'the roll moves nothing: ' + lo + ' to ' + hi;
    const r = (1000 + D.rollSpreadPm) / (1000 - D.rollSpreadPm);
    if (Math.abs(hi / lo - r) > 0.05) return 'the roll spans x' + hi / lo + ', not x' + r;
    return null;
  },
  switch(M) {
    const D = M.amountData;
    if (typeof D.hitRoll !== 'boolean') return 'AMOUNT.hitRoll is not a switch';
    /* a monster beside a hero, its swing due: an rng that never lands a chance misses only while the switch holds */
    const swingOnce = (risk) => {
      const h = { ...heroAt(refL(M), 1000 * gearL(M)), x: 5, y: 5, hp: 500, maxHp: 500, role: 'tank', kind: 'tank', def: 1, acc: 1000, maxHit: 6, stance: 'balanced' };
      const units = [M.worldstate.makeUnit(h), mon(M, 2, 0, 5, 6, { kind: 'rat', target: 1, swingLeftMs: 0 })];
      const w = world(M, units, { phase: 'fight', leader: 1 });
      w.risk = risk; w.danger = M.dangerData.DANGER_GROUNDS[G].refStep; w.low = 1000; w.climb = 1;
      const inst = { world: w, ground: groundRow({ id: G }), grid: gridOf(M), occ: null, monsters: M.MONSTERS, tier: null, makeUnit: M.worldstate.makeUnit };
      const events = [];
      const sc = { atMs: 0, dtMs: 100, swing: 0, rng: { chance: () => false, int: (a) => a, next: () => 0.5 }, events, emit: (e) => events.push(e), track: () => {} };
      M.hunt.damage.resolveAttacks(inst, sc);
      return events.filter((e) => e.u === 2).map((e) => e.type);
    };
    const on = swingOnce('steady');
    if (D.hitRoll ? !on.includes('miss') : !on.includes('dmg')) return 'with hitRoll ' + D.hitRoll + ' the swing on the scale made ' + JSON.stringify(on);
    if (!swingOnce('').includes('miss')) return 'off the scale the to-hit roll was skipped';
    return null;
  },
  snapshot(M) {
    const HAMMER = Object.keys(M.ITEMS).find((id) => M.ITEMS[id].slot === 'weapon' && M.ITEMS[id].weaponType === 'hammer');
    if (!HAMMER) return 'CONTROL: no hammer';
    const kit = { weapon: HAMMER, body: 'iron_platebody', helmet: 'iron_helm' };
    const { eq, setBonus, profile } = M.member.loadoutOf(kit, M.ITEMS);
    const snap = M.member.heroSnapshot({ skills: {}, levelXp: 0 }, { eq, equipment: kit, items: M.ITEMS, bonus: () => 0, setBonus, profile });
    if (snap.blowBp !== M.amountData.blowTopBp.hammer) return 'a hammer\'s snapshot carries a top of ' + snap.blowBp;
    const dg = M.amount.defenseGearPm(kit, M.ITEMS);
    if (snap.armorGearPm !== dg.armorPm || snap.wardPm !== dg.wardPm || !(snap.armorGearPm > snap.wardPm)) return 'the snapshot carries armor ' + snap.armorGearPm + ' and ward ' + snap.wardPm;
    const side = M.member.memberSide({ key: 'a', seat: 0, equipment: kit, skills: {}, levelXp: 0, hp: 100, gold: 0, hero: { role: 'melee_dps', slots: [] } }, { items: M.ITEMS });
    const fr = M.member.frozenOf(side, [], 0, M.MONSTERS), peer = M.member.frozenSide({ key: 'a', seat: 0, unitId: 1, frozen: fr }).member.snapshot();
    for (const k of ['blowBp', 'armorGearPm', 'wardPm', 'critPm', 'buffDmgPm']) if (peer[k] !== snap[k]) return 'the browser\'s peer carries ' + k + ' ' + peer[k] + ', the server ' + snap[k];
    return null;
  },
};

const A = 'src/core/hunt/amount.js';
cases.refco = (M) => {
  const A = M.amount, D = M.amountData, R = M.refCo.refCompany;
  const share = (L) => R(L, 'steps').dpsHead / A.refHealth(L);
  for (const L of [30, 60, 175, 300, 3000]) {
    const c = R(L, 'steps');
    if (Math.abs(share(L) - share(60)) > 1e-12) return 'the pipeline reference deals ' + share(L) + ' of a reference health a second at Level ' + L + ', ' + share(60) + ' at 60';
    if (c.hp !== A.refHealth(L) || c.takePm !== D.pressurePm || c.hit !== (D.hitRoll ? 0.7 : 1)) return 'the pipeline reference at Level ' + L + ' reads ' + JSON.stringify(c);
  }
  if (Math.abs(R(D.fitLevel, 'steps').dpsHead - R(D.fitLevel).dpsHead) > 1e-9) return 'at the fit Level the pipeline and the table disagree';
  if (R(175).dpsHead === R(175, 'steps').dpsHead) return 'CONTROL: the old chain\'s table holds the pipeline\'s share at 175';
  /* the derivation reads the door by the ground: a ground row on the scale the pipeline's, a Tower room (no refStep) the old chain's */
  const role = 'brute';
  const g = { refLevel: 175, refStep: 540 };
  const onScale = M.mformula.roleStats(role, g).hp, room = M.mformula.roleStats(role, { refLevel: 175 }).hp;
  if (!(onScale > room * 2)) return 'a scale ground\'s brute at 175 has ' + onScale + ' health, a Tower room\'s ' + room + ': the scale is not read off the pipeline';
  return null;
};
/* IMBUEMENTS ON THE SCALE (lane/tp-im-steps; src/core/imbue.js, 21 D-11): one blow through the pipeline. A Level 200 hero wearing Brute
   Edge, Fire Ward and Mana Leech at its own band reads 2 more conditional steps on a brute (Muster's knight) and none on a swarm (a
   pikeman), 2 fewer on an ember blow at it and none on a plain one, and a damage meal on top of the three adds nothing (their room fills
   the consumable slice); the same meal alone counts. */
cases.imbue = (M) => {
  const A = M.amount, inst = instOn('steady', M), L = 200;
  const knight = { side: 'mon', id: 3, kind: 'muster_knight', alive: true }, pike = { side: 'mon', id: 4, kind: 'barrow_pikeman', alive: true };
  if (M.MONSTERS.muster_knight.role !== 'brute' || M.MONSTERS.barrow_pikeman.role !== 'swarm') return 'CONTROL: Muster\'s knight is no brute or its pikeman no swarm';
  const set = [{ id: 'brute_edge', band: L, kind: 'edge' }, { id: 'fire_ward', band: L, kind: 'ward' }, { id: 'mana_leech', band: L, kind: 'leech' }];
  const cond = (src, tgt, element) => { const t = {}; A.blowAmount(inst, { source: src, target: tgt, mean: 1000, el: 1000, ward: !!element, element, rng: LOW, trace: t }); return t.cond; };
  const bare = heroAt(L, 1000 * L), worn = heroAt(L, 1000 * L, { imbues: set });
  const fed = heroAt(L, 1000 * L, { buffDmgPm: 50 }), both = heroAt(L, 1000 * L, { buffDmgPm: 50, imbues: set });
  const d = (a, b) => Math.round((a - b) * 1000) / 1000;
  /* (each at its fire size, 21 D-17: Brute Edge 5, Fire Ward 11) */
  if (d(cond(worn, knight), cond(bare, knight)) !== 5) return 'Brute Edge on a brute moves the blow ' + d(cond(worn, knight), cond(bare, knight)) + ' steps, want 5';
  if (d(cond(worn, pike), cond(bare, pike)) !== 0) return 'Brute Edge on a swarm moves the blow ' + d(cond(worn, pike), cond(bare, pike)) + ' steps, want 0';
  if (d(cond(bare, pike, 'ember'), cond(worn, pike, 'ember')) !== 0 || d(cond(knight, bare, 'ember'), cond(knight, worn, 'ember')) !== 11) return 'Fire Ward does not take 11 steps off an ember blow at its hero, and only that';
  if (d(cond(knight, bare), cond(knight, worn)) !== 0) return 'Fire Ward moves a plain blow at its hero';
  if (!(d(cond(fed, pike), cond(bare, pike)) > 0)) return 'CONTROL: a damage meal alone moves nothing';
  if (d(cond(both, pike), cond(worn, pike)) !== 0 || d(cond(both, knight), cond(worn, knight)) !== 0) return 'a damage meal on top of three imbuements adds ' + d(cond(both, pike), cond(worn, pike)) + ' steps: the room rule is gone (21 D-11)';
  /* THE CONVERSION (21 D-18, lane/imbue-engine): Fire Edge resolves 5% of a plain blow at the target's percent for Fire. Muster's Undead
     take Fire at 1150: +2 steps (stepsOf 1.0075), its rated size; a stone golem resists it (750): a whole cost, -4 (stepsOf 0.9875); a
     Fire blow at the Undead converts nothing; and the clamp holds the gain (with the Ward and the Leech waiting and a meal, the four reads
     the slice's 6) */
  const golem = { side: 'mon', id: 5, kind: 'stone_golem', alive: true };
  const fireEdge = heroAt(L, 1000 * L, { imbues: [{ id: 'fire_edge', band: L, kind: 'edge' }] });
  const el = (t, e) => M.MONSTERS[t.kind] && M.targeting.elementOn(t, e);
  if (el(knight, 'ember') !== 1150 || el(golem, 'ember') !== 750 || el(knight, 'physical') !== 1000 || el(golem, 'physical') !== 1000) return 'CONTROL: Muster\'s knight takes Fire at ' + el(knight, 'ember') + ' and the golem at ' + el(golem, 'ember');
  const blowCond = (src, t, element, pm) => { const tr = {}; const e = pm || (element ? el(t, element) : 1000); A.blowAmount(inst, { source: src, target: t, mean: 1000, el: e, ward: !!element, element, rng: LOW, trace: tr }); return tr.cond; };
  const conv = (t, element, pm) => blowCond(fireEdge, t, element, pm), plainOf = (t, element, pm) => blowCond(bare, t, element, pm);
  if (d(conv(knight), plainOf(knight)) !== 2) return 'Fire Edge on an Undead (Fire 1150) moves a plain blow ' + d(conv(knight), plainOf(knight)) + ' steps, want +2';
  if (d(conv(golem), plainOf(golem)) !== -4) return 'Fire Edge on a stone golem (Fire 750) moves a plain blow ' + d(conv(golem), plainOf(golem)) + ' steps, want a whole -4';
  if (d(conv(knight, 'ember'), plainOf(knight, 'ember')) !== 0) return 'Fire Edge moves a Fire blow ' + d(conv(knight, 'ember'), plainOf(knight, 'ember')) + ' steps: converting Fire to Fire changes nothing';
  /* a blow the Undead takes at half (500): 5% of it at Fire's 1150 is stepsOf(1.065) = 18, a gain the slice's cap holds to 6 */
  if (d(conv(knight, null, 500), plainOf(knight, null, 500)) !== 6) return 'Fire Edge on a blow at 500 against Fire 1150 moves it ' + d(conv(knight, null, 500), plainOf(knight, null, 500)) + ' steps, want the slice\'s cap of 6 (a gain the clamp holds)';
  const full = heroAt(L, 1000 * L, { buffDmgPm: 50, imbues: [{ id: 'fire_edge', band: L, kind: 'edge' }, { id: 'fire_ward', band: L, kind: 'ward' }, { id: 'life_leech', band: L, kind: 'leech' }] });
  const fullCond = (() => { const tr = {}; A.blowAmount(inst, { source: full, target: knight, mean: 1000, el: 1000, rng: LOW, trace: tr }); return tr.cond; })();
  if (d(fullCond, plainOf(knight)) !== 2) return 'Fire Edge beside a waiting Ward, Leech and a meal reads ' + d(fullCond, plainOf(knight)) + ' steps on an Undead, want 2 (the slice of 6 less two rooms of 2)';
  /* A CONVERSION WAITS ON A BLOW IT DOES NOT CHANGE (21 D-22, lane/imbue-d21-d22): on a Fire blow at the Undead the Edge converts nothing
     but still takes its room of 2, so a damage meal beside it reads 4 of the slice's 6 (a meal alone reads the 6) */
  const fedEdge = heroAt(L, 1000 * L, { buffDmgPm: 50, imbues: [{ id: 'fire_edge', band: L, kind: 'edge' }] });
  if (d(blowCond(fed, knight, 'ember'), plainOf(knight, 'ember')) !== 6) return 'CONTROL: a damage meal alone on a Fire blow reads ' + d(blowCond(fed, knight, 'ember'), plainOf(knight, 'ember')) + ' steps, want the slice\'s 6';
  if (d(blowCond(fedEdge, knight, 'ember'), plainOf(knight, 'ember')) !== 4) return 'a damage meal beside a Fire Edge on a Fire blow reads ' + d(blowCond(fedEdge, knight, 'ember'), plainOf(knight, 'ember')) + ' steps, want 4 (the Edge waits on its room of 2, 21 D-22)';
  return null;
};
/* THE LEECH IN THE FIGHT (21 D-18, lane/imbue-engine; src/core/hunt/imbue-leech.js through damage.js landHit, the one door every blow takes):
   a Level 60 Life Leech hero's (band 50: 19 permille on the curve, D-21) five 30 HP swings at a monster heal 0, 1, 0, 1, 0 (570
   thousandths carried each), each a `heal` from the hero to itself naming the imbuement, after its `dmg`; a status tick (a `dot` piece) heals nothing and moves no carry; a Mana Leech's mana rides
   the blow's `dmg` as `back` and fills no HP; the same hero with nothing worn (imbuements dark) writes no heal and keeps a carry of 0. */
cases.leech = (M) => {
  const h = M.worldstate.makeUnit({ id: 1, side: 'hero', kind: 'hero', alive: true, hp: 100, maxHp: 400, mana: 0, maxMana: 0, x: 4, y: 3 });
  /* (the settle writes these at every boundary, never persisted: combat-sim.js syncUnit) */
  Object.assign(h, { heroLv: 60, imbues: [{ id: 'life_leech', band: 50, kind: 'leech', untilMs: null }] });
  const m = mon(M, 2, 0, 5, 3, { hp: 1000000, maxHp: 1000000 });
  const w = world(M, [h, m], { phase: 'fight', leader: 1 });
  const inst = { world: w, ground: groundRow(), grid: gridOf(M), occ: null, monsters: M.MONSTERS, tier: null };
  const events = [];
  const sc = { atMs: 0, dtMs: 100, swing: 0, rng: LOW, emit: (e) => events.push(e), track: () => {} };
  if (h.leechMilli !== 0) return 'CONTROL: a new hero unit carries ' + h.leechMilli + ' (the persisted field is not blank 0)';
  const heals = [];
  for (let i = 0; i < 5; i++) {
    const before = events.length;
    const r = M.damage.landHit(inst, sc, h, m, 30, null, { id: 'basic', exact: true }, false);
    if (r.dmg !== 30) return 'CONTROL: an exact 30 landed ' + r.dmg;
    const mine = events.slice(before);
    const heal = mine.find((e) => e.type === 'heal');
    if (heal && (heal.u !== 1 || heal.t !== 1 || heal.ability !== 'life_leech' || mine.indexOf(heal) < mine.findIndex((e) => e.type === 'dmg'))) return 'the leech\'s heal is ' + JSON.stringify(heal) + ', want the hero to itself naming life_leech, after its dmg';
    heals.push((heal ? heal.amount : 0) + '/' + h.leechMilli);
  }
  /* (a band 50 Leech at Level 60 heals 19 permille, 20 x c: 21 D-21) */
  if (heals.join() !== '0/570,1/140,0/710,1/280,0/850' || h.hp !== 102) return 'five 30 HP swings healed ' + heals.join() + ' (HP ' + h.hp + '), want 0/570,1/140,0/710,1/280,0/850 and 102';
  h.leechMilli = 500;
  const n0 = events.length;
  M.damage.landHit(inst, sc, h, m, 3000, null, { id: 'bleed', dot: true, exact: true });
  if (events.slice(n0).some((e) => e.type === 'heal') || h.leechMilli !== 500 || h.hp !== 102) return 'a status tick leeched (carry ' + h.leechMilli + ', HP ' + h.hp + ')';
  /* a Mana Leech */
  h.imbues = [{ id: 'mana_leech', band: 55, kind: 'leech', untilMs: null }]; h.maxMana = 100; h.mana = 0; h.leechMilli = 0;
  const n1 = events.length;
  M.damage.landHit(inst, sc, h, m, 1000, null, { id: 'basic', exact: true }, false);
  const dmg = events.slice(n1).find((e) => e.type === 'dmg');
  if (!dmg || dmg.back !== 10 || h.mana !== 10 || h.hp !== 102 || events.slice(n1).some((e) => e.type === 'heal')) return 'a Mana Leech on a 1,000 HP blow wrote ' + JSON.stringify(dmg) + ' (mana ' + h.mana + ', HP ' + h.hp + '), want back 10, 10 mana and no heal';
  /* dark: nothing worn */
  delete h.imbues; h.leechMilli = 0;
  const n2 = events.length;
  M.damage.landHit(inst, sc, h, m, 30, null, { id: 'basic', exact: true }, false);
  if (events.slice(n2).some((e) => e.type === 'heal' || e.back !== undefined) || h.leechMilli !== 0) return 'a hero with nothing worn leeched';
  return null;
};
/* BOTH PATHS (CLAUDE.md section 4; lane/tp-im-steps): Temper on steps and three imbuements on Muster Barrows' four, through the real settle
   (play-ground.mjs: the server's one settle), in 10-minute windows (a closed hunt) and 100-second ones (a viewed hunt): each changes the
   hunt, and the two cuts play one hunt. Read from the repository's own settle (no mutant reaches it: the cases above hold the rules). */
async function pathsOf(M, opts) {
  const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href + V);
  const P = await loadPlay(ROOT);
  const four = ['tank', 'melee_dps', 'mage', 'healer'];
  const go = (o, windowMs) => {
    const r = P.run(G, 70, four, { spanMs: 600000, windowMs, secret: '-4611686018427387904', options: () => ({ risk: 'steady', danger: 570 }),
      equipment: (role, i, L) => P.kitFor(L, role), ...o });
    /* key order is the order a window first met each buy, so the signature sorts every key (the counts are the hunt) */
    const sorted = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
    return JSON.stringify(sorted({ t: r.totals, x: r.heroXp }));
  };
  const plain = go({}, 600000), closed = go(opts, 600000), viewed = go(opts, 100000);
  return { plain, closed, viewed };
}
const ALL5 = Object.freeze(Object.fromEntries(['weapon', 'shield', 'helmet', 'body', 'pants', 'boots', 'gloves', 'cape', 'amulet', 'ring1', 'ring2', 'ammo', 'belt'].map((s) => [s, 5])));
const pathCases = {
  'temper-paths': async (M) => {
    const p = await pathsOf(M, { temperSteps: ALL5 });
    if (p.plain === p.closed) return 'Temper 5 on every slot played the hunt of no Temper: the seated ranks never reached the gear part';
    return p.closed === p.viewed ? null : 'Temper settled in 10-minute and 100-second windows played two hunts';
  },
  'imbue-paths': async (M) => {
    const set = [{ id: 'brute_edge', band: 70, msLeft: 3600000 }, { id: 'fire_ward', band: 70, msLeft: 3600000 }, { id: 'mana_leech', band: 70, msLeft: 3600000 }];
    const p = await pathsOf(M, { wornImbues: () => set });
    if (p.plain === p.closed) return 'Brute Edge on Muster\'s knights played the hunt of no imbuement: the worn set never reached the fight';
    return p.closed === p.viewed ? null : 'imbuements settled in 10-minute and 100-second windows played two hunts';
  },
};
const mutants = [
  { name: 'an imbuement never reaches the fight', case: 'imbue', edits: [[A, 'const rows = u.imbues ? imbueRows(', 'const rows = false ? imbueRows(']] },
  { name: 'an imbuement reads no monster role', case: 'imbue', edits: [[A, '{ role: other ? roleIdOf(inst, other) : null,', '{ role: null,']] },
  { name: 'an imbuement reads no element', case: 'imbue', edits: [[A, 'element: c.element || null, convert }, u.heroLv)', 'element: null, convert }, u.heroLv)']] },
  /* lane/imbue-engine (21 D-18): the conversion and the leech in the fight */
  { name: 'a conversion is never priced', case: 'imbue', edits: [[A, 'element: c.element || null, convert }, u.heroLv)', 'element: c.element || null, convert: null }, u.heroLv)']] },
  { name: 'a conversion reads the blow\'s element as the target\'s Fire', case: 'imbue', edits: [[A, 'convertMult(cv, elementOn(other, cv.element), c.el)', 'convertMult(cv, c.el, c.el)']] },
  { name: 'a conversion\'s cost is held to nothing', case: 'imbue', edits: [['src/core/imbue.js', '    if (n) out.push({ slice: \'consumable\', raises: channel, steps: (steps * n) / IMBUE.steps, key: r.key });', '    if (n > 0) out.push({ slice: \'consumable\', raises: channel, steps: (steps * n) / IMBUE.steps, key: r.key });']] },
  { name: 'a conversion skips the clamp', case: 'imbue', edits: [['src/core/imbue.js', '    if (n) out.push({ slice: \'consumable\', raises: channel, steps: (steps * n) / IMBUE.steps, key: r.key });', '    if (n) out.push({ slice: \'consumable\', raises: channel, steps: (steps * n) / IMBUE.steps, room: 2, key: r.key });']] },
  /* lane/imbue-d21-d22 (21 D-22): a conversion that changes the blow by nothing still takes its room (planted: the rule as it stood) */
  { name: 'a conversion that changes nothing takes no room', case: 'imbue', edits: [['src/core/imbue.js', '    else if (on && holdsOn(r, ctx)) {',
    "    else if (on && r.convert && ctx && typeof ctx.convert === 'function') continue;\n    else if (on && holdsOn(r, ctx)) {"]] },
  { name: 'the leech never reaches the blow', case: 'leech', edits: [['src/core/hunt/damage.js', '&& r.dmg > 0 ? leechOn(source, target, r.dmg) : null;', '&& r.dmg > 0 ? null : null;']] },
  { name: 'a status tick leeches', case: 'leech', edits: [['src/core/hunt/damage.js', 'source.imbues && !(ability && ability.dot) && r.dmg > 0 ?', 'source.imbues && r.dmg > 0 ?']] },
  { name: 'the leech heals with no event', case: 'leech', edits: [['src/core/hunt/damage.js', "  if (lee && lee.hp) sc.emit(makeEvent('heal', sc.atMs, { u, t: u, amount: lee.hp, ability: lee.id }));\n", '']] },
  { name: 'a Mana Leech\'s mana rides no event', case: 'leech', edits: [['src/core/hunt/damage.js', '...(lee && lee.mana ? { back: lee.mana } : {}), ', '']] },
  { name: 'the carry is never kept on the unit', case: 'leech', edits: [['src/core/hunt/imbue-leech.js', '  u.leechMilli = pay.carry;\n', '']] },
  { name: 'the scale reads the old chain\'s table', case: 'refco', edits: [['src/core/hunt/monster-formula.js', "refCompany(g.refLevel, Number.isInteger(g.refStep) ? 'steps' : null)", 'refCompany(g.refLevel, null)']] },
  { name: 'the pipeline reference grows like the table', case: 'refco', edits: [['src/core/reference-company.js', '    const dpsHead = share * refHealth(L);', '    const dpsHead = tableDps(L);']] },
  { name: 'the pipeline reference takes the armor chain\'s share', case: 'refco', edits: [['src/core/reference-company.js', '      takePm: AMOUNT.pressurePm,', '      takePm: R.takePm + 1,']] },
  { name: 'the gap never reaches the blow', case: 'slope', edits: [[A, '  const steps = Math.round(gap + cond);\n  const sp = AMOUNT.rollSpreadPm;\n  const roll = c.rng.int(', '  const steps = Math.round(cond);\n  const sp = AMOUNT.rollSpreadPm;\n  const roll = c.rng.int(']] },
  { name: 'armor and ward swapped', case: 'slope', edits: [[A, 'gearPm: int(ward ? u.wardPm : u.armorGearPm)', 'gearPm: int(ward ? u.armorGearPm : u.wardPm)']] },
  { name: 'a heavy piece spends evenly', case: 'slope', edits: [['src/data/amount.js', 'heavy: Object.freeze({ armorSteps: 15, wardSteps: -15 })', 'heavy: Object.freeze({ armorSteps: 0, wardSteps: 0 })']] },
  { name: 'the split is a share of the item Level', case: 'slope', edits: [['src/core/hunt/amount.js', '    armorPm += w * (il + (split ? split.armorSteps : 0));', '    armorPm += Math.floor((w * il * (split ? 1000 + 17 * split.armorSteps : 1000)) / 1000);']] },
  { name: 'the reference health read at the hero\'s Level for a blow at a monster', case: 'reference', edits: [[A, '(topBpOf(source) / 10000) * refHealth(L0);', '(topBpOf(source) / 10000) * refHealth(lvOf(source));']] },
  { name: 'pressure never read', case: 'reference', edits: [[A, 'base = c.mean * (AMOUNT.pressurePm / 1000) *', 'base = c.mean *']] },
  { name: 'a monster\'s blow at a hero read on the ground\'s Level alone', case: 'scale', edits: [[A, ' * (refHealth(L) / refHealth(L0));', ';']] },
  { name: 'a heal read on the ground\'s Level', case: 'scale', edits: [[A, ': (mean / 1000) * (topBpOf(u) / 10000) * refHealth(L);', ': (mean / 1000) * (topBpOf(u) / 10000) * refHealth(refLevelOf(inst.ground));']] },
  { name: 'nearest is the lower step', case: 'exact', edits: [[A, '  const n = mult * mult <= ratioOf(lo) * ratioOf(hi) ? lo : hi;', '  const n = lo;']] },
  { name: 'no conditional ceiling', case: 'conditional', edits: [[A, 'const held = (n) => (n > CAP ? CAP : n);', 'const held = (n) => n;']] },
  { name: 'the answer outside the gear slice', case: 'conditional', edits: [[A, "    if (answer > 0) add('gear', answer, 'answer');", "    if (answer > 0) add('temper', answer, 'answer');"]] },
  { name: 'a crit reads its whole size, not its mean', case: 'conditional', edits: [[A, "stepsOf(1 + (int(u.critPm) / 1000) * (c.critMult - 1))", "stepsOf(c.critMult)"]] },
  { name: 'a slow is a gain', case: 'conditional', edits: [[A, '  if (c.slowPm > 0) cond -= held(', '  if (c.slowPm > 0) cond += held(']] },
  { name: 'no roll', case: 'roll', edits: [[A, '  const roll = c.rng.int(1000 - sp, 1000 + sp);\n  const n = Math.max(1, Math.round(base * mult', '  const roll = 1000;\n  const n = Math.max(1, Math.round(base * mult']] },
  { name: 'the switch ignored', case: 'switch', edits: [['src/core/hunt/damage.js', '    if (AMOUNT.hitRoll && !sc.rng.chance(accuracy))', '    if (!AMOUNT.hitRoll && !sc.rng.chance(accuracy))']] },
  { name: 'the snapshot reads no weapon top', case: 'snapshot', edits: [['src/core/member.js', 'armorGearPm: dg.armorPm, wardPm: dg.wardPm, blowBp, critPm, buffDmgPm,', 'armorGearPm: dg.armorPm, wardPm: dg.wardPm, critPm, buffDmgPm,']] },
  { name: 'the peer drops the ward', case: 'snapshot', edits: [['src/core/member.js', 'wardPm: snap.wardPm || 0, blowBp:', 'blowBp:']] },
];

const R = makeReport('hunt-core/amount');
const M = await load(ROOT);
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const [cn, fn] of Object.entries(pathCases)) {
  let why = null;
  try { why = await fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const mu of mutants) {
  const p = plant(mu.edits, ['src/render']);
  try {
    let why = null;
    try { why = cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    if (process.env.H2_WHY) console.log('  mutant "' + mu.name + '" -> ' + why);
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
