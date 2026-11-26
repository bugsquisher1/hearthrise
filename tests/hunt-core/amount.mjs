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
//
// mutant-anchors: src/core/hunt/amount.js src/core/hunt/damage.js src/data/amount.js src/core/member.js
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
    /* Tempering: its own slice's cap */
    const tc = M.dangerData.GEAR_STEPS && 5;
    const te = {};
    A.blowAmount(inst, { source: { ...ref, blowsPm: 50 }, target: rat, mean: 1000, el: 1000, rng: LOW, trace: te });
    if (te.steps !== Math.min(tc, A.stepsOf(1.05))) return 'Tempering +5% is ' + te.steps + ' steps, not its slice\'s ' + Math.min(tc, A.stepsOf(1.05));
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
  if (d(cond(worn, knight), cond(bare, knight)) !== 2) return 'Brute Edge on a brute moves the blow ' + d(cond(worn, knight), cond(bare, knight)) + ' steps, want 2';
  if (d(cond(worn, pike), cond(bare, pike)) !== 0) return 'Brute Edge on a swarm moves the blow ' + d(cond(worn, pike), cond(bare, pike)) + ' steps, want 0';
  if (d(cond(bare, pike, 'ember'), cond(worn, pike, 'ember')) !== 0 || d(cond(knight, bare, 'ember'), cond(knight, worn, 'ember')) !== 2) return 'Fire Ward does not take 2 steps off an ember blow at its hero, and only that';
  if (d(cond(knight, bare), cond(knight, worn)) !== 0) return 'Fire Ward moves a plain blow at its hero';
  if (!(d(cond(fed, pike), cond(bare, pike)) > 0)) return 'CONTROL: a damage meal alone moves nothing';
  if (d(cond(both, pike), cond(worn, pike)) !== 0 || d(cond(both, knight), cond(worn, knight)) !== 0) return 'a damage meal on top of three imbuements adds ' + d(cond(both, pike), cond(worn, pike)) + ' steps: the room rule is gone (21 D-11)';
  return null;
};
const mutants = [
  { name: 'an imbuement never reaches the fight', case: 'imbue', edits: [[A, 'const rows = u.imbues ? imbueRows(', 'const rows = false ? imbueRows(']] },
  { name: 'an imbuement reads no monster role', case: 'imbue', edits: [[A, '{ role: other ? roleIdOf(inst, other) : null,', '{ role: null,']] },
  { name: 'an imbuement reads no element', case: 'imbue', edits: [[A, 'element: c.element || null }, u.heroLv)', 'element: null }, u.heroLv)']] },
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
