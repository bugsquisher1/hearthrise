// tests/hunt-core/silent-triggers.mjs — A SLOT THAT ISN'T FIRING SAYS WHY (SAY WHY, Tyler 2026-10-25; lane/a-silent-triggers: Fireball's
// suggested trigger never fires on a lone monster, and a Mage who kept it was never told). Run by run-all.mjs.
//
//   lone-monster        a Mage's default bar on one monster: the engine casts Fireball 0 times in a minute and Frost Lance still
//                       fires; the slot says why, marked, not struck. Two side by side and it fires, and says nothing.
//   lone-hero           a Healer's Circle of Renewal, alone and hurt: 0 casts, and the slot says so with no fight behind it (in town too).
//                       In a duo, both hurt, it fires and says nothing.
//   monsters-apart      two monsters in reach but too far apart: 0 casts, and the words don't claim there's only one.
//   mana-threshold      the Mage's Frost Lance under 70% mana: 0 casts, words only: the slot isn't marked.
//   every-suggestion    THE CLASS, from the data: every ability on its own suggested conditions, in the ordinary fights: the engine's
//                       cast and the words never disagree. It fires and says nothing, or it doesn't and says why. A new row is covered by being a row.
//   suggestions-readable every suggested and default condition names a metric the engine can read, and every metric x operator has words.
//   between-pulls       with nothing engaged a slot isn't waiting on its conditions: no words, no mark.
//   display-only        asking leaves the world byte-identical: it can never move the prediction's hash.
//   ignored             a slot ignoring the monster its hero fights says that, not a condition that holds.
//   order               a strike beats a wait; a marked wait beats mana; mana beats a wait the player can read.
//   configure-note      the line Configure action shows: the lone monster, the lone hero, and silence where nothing surprises.
//   alone-only          UNDERTOW (Tyler 2026-11-09: "can only be used when not in a party. Make that callout clear to the player"): beside a
//                       living partner the engine casts it 0 times and the slot greys with "Only when you hunt alone."; the partner dead,
//                       it fires and says nothing; its card and its Configure action line say the words; no other ability carries them.
//
//   node tests/hunt-core/silent-triggers.mjs [--mutate]   cases + mutants (each mutant must turn its case red)
//   node tests/hunt-core/silent-triggers.mjs --no-mutate  cases only
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCore, makeReport, plant, ROOT, hero, mon, world, instOf, subStep } from './fixtures/h1.js';
import { supplySession } from './fixtures/h4.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];

async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.W = await imp('src/shell/slot-waits.js');
  M.F = await imp('src/shell/action-facts.js');
  M.L = await imp('src/hunt-view/live-engine.js');
  M.AD = await imp('src/data/abilities.js');
  M.CM = await imp('src/data/condition-metrics.js');
  M.CD = await imp('src/data/consumables.js');
  M.KIT = await imp('src/data/start-kit.js');
  return M;
}

/* A hero's first discipline as the role the fixture fights in. */
const ROLE = { shield: 'tank', sword: 'melee_dps', dual_axe: 'melee_dps', club: 'melee_dps', ranged: 'ranger', destruction: 'mage', restoration: 'healer' };
const roleOf = (r) => (r.universal ? 'melee_dps' : ROLE[r.disciplines[0]]);
/* Every rune family and a stack of arrows: a supply is never why a slot here isn't firing. */
const BAG = Object.fromEntries(['chalked_fire_rune', 'chalked_ice_rune', 'chalked_earth_rune', 'chalked_water_rune', 'chalked_poison_rune', 'chalked_rupture_rune', 'iron_arrows']
  .map((id) => [id, { loaded: 5000 }]));
/* The slot as the bar reads it from the server (hunt-sections.js slotOf). */
const slotOf = (id, conditions) => ({ empty: false, action: { type: 'ability', id }, conditions, join: 'and', ignore: [], usable: true });
const suggested = (M, id) => slotOf(id, M.conditions.suggestedConditions({ type: 'ability', id }));

/* One fight: hero 1 of `role` and, in a duo, hero 2 (no entry: it fires nothing); `mons` the tiles of the monsters on `on`, 900 HP each. */
function fight(M, role, slots, o) {
  const x = o || {};
  const hp = x.hurt ? 40 : 100;
  const me = hero(M, 1, 11, 3, { role, hp, maxHp: 100, mana: x.mana ?? 500, maxMana: x.maxMana ?? 500 });
  const units = [me];
  if (x.duo) units.push(hero(M, 2, 10, 3, { role: 'melee_dps', hp, maxHp: 100, mana: 100, maxMana: 100 }));
  (x.mons || []).forEach(([mx, my], i) => units.push(mon(M, 10 + i, 0, mx, my, { target: x.idle ? null : (x.on || 1), hp: x.monHp ?? 900, maxHp: x.monHp ?? 900 })));
  const inst = instOf(M, world(M, units));
  const row = { hs: supplySession(M, { bag: JSON.parse(JSON.stringify(BAG)) }), actionSet: 'hunt', range: 7, ammo: 'iron_arrows', slots: M.conditions.heroSlots(slots, null) };
  inst.heroes = { 1: row };
  const member = { unitId: 1, hs: row.hs, hero: { range: row.range, ammo: row.ammo } };
  return { inst, me, row, member, party: x.duo ? 2 : 1, test: () => M.L.slotTesterOf(inst.world, inst.grid, member, null) };
}
/* The casts of a whole span on the real ability path, by ability. `each` runs before each sub-step (a hero held hurt). */
function casts(M, f, ms, each) {
  const n = {};
  for (let at = 0; at < ms; at += 100) {
    if (each) each();
    const sc = subStep(at); sc.rng = M.rng.createRng(7 + at);
    M.abilities.castAbilities(f.inst, sc);
    for (const e of sc.events) if (e.type === 'cast') n[e.ability] = (n[e.ability] || 0) + 1;
  }
  return n;
}

const FIGHTS = Object.freeze({
  'a lone monster, full health': { mons: [[13, 3]] },
  'a lone monster, hurt': { mons: [[13, 3]], hurt: true },
  'two side by side, hurt': { mons: [[13, 3], [14, 3]], hurt: true },
  'two far apart, hurt': { mons: [[12, 3], [12, 8]], hurt: true },
  'a duo, both hurt, the monster on me': { mons: [[13, 3]], duo: true, hurt: true },
  'a duo, both hurt, the monster on my partner': { mons: [[13, 3]], duo: true, hurt: true, on: 2 },
});

const cases = {
  'lone-monster': (M) => {
    const bar = M.RS.ROLE_RULES.mage;
    const f = fight(M, 'mage', bar, { mons: [[13, 3]], monHp: 10000000, mana: 5000, maxMana: 5000 });
    const sl = slotOf('fireball', bar[0].conditions);
    const said = M.W.waitReason(sl, 1, f.test());
    if (!said) return 'a Mage\'s Fireball on a lone monster says nothing';
    if (said.strike || said.rest || said.need !== '2+') return 'it should wait, marked "2+", not struck: ' + JSON.stringify(said);
    if (!/^Waiting: needs 2 or more monsters in its area\./.test(said.text)) return 'it reads ' + JSON.stringify(said.text);
    const n = casts(M, f, 60000);
    if (n.fireball) return 'the engine cast Fireball ' + n.fireball + ' times on a lone monster: re-judge the words (and the designer\'s default)';
    if (!n.frost_lance) return 'CONTROL: Frost Lance never fired either, so the fixture proves nothing';
    const two = fight(M, 'mage', bar, { mons: [[13, 3], [14, 3]], monHp: 10000000, mana: 5000, maxMana: 5000 });
    const free = M.W.waitReason(sl, 1, two.test());
    if (free) return 'with two side by side it still says ' + JSON.stringify(free.text);
    return casts(M, two, 100).fireball ? null : 'CONTROL: Fireball did not fire with two side by side';
  },
  'lone-hero': (M) => {
    const sl = suggested(M, 'circle_of_renewal');
    const alone = fight(M, 'healer', [sl], { mons: [[13, 3]], hurt: true });
    const held = () => { alone.me.hp = 40; };
    if (casts(M, alone, 60000, held).circle_of_renewal) return 'the engine cast Circle of Renewal for a lone hero: re-judge the words';
    /* With no fight behind it (town, or no prediction running) it still says so: it needs only the party's size. */
    for (const [where, test] of [['in town', null], ['in a fight', alone.test()]]) {
      const said = M.W.waitReason(sl, 1, test);
      if (!said || said.strike || said.need !== '2+' || said.text !== 'Waiting: needs 2 or more heroes under 80% health, and you’re not in a party.') return where + ' a lone Healer\'s Circle reads ' + JSON.stringify(said);
    }
    const duo = fight(M, 'healer', [sl], { mons: [[13, 3]], duo: true, hurt: true });
    const free = M.W.waitReason(sl, 2, duo.test());
    if (free) return 'a duo, both hurt, still reads ' + JSON.stringify(free.text);
    if (!casts(M, duo, 100).circle_of_renewal) return 'CONTROL: Circle did not fire for a duo, both hurt';
    /* A party too small for the slot's own number, and a party it now fits but nobody is hurt yet. */
    const wants3 = slotOf('circle_of_renewal', [{ metric: 'allies_below', op: 'gte', value: 3, subject: 'under_80' }]);
    const small = M.W.waitReason(wants3, 2, null);
    if (!small || !/your party has 2\.$/.test(small.text)) return 'wanting 3 in a party of 2 reads ' + JSON.stringify(small);
    const fine = M.W.waitReason(sl, 2, fight(M, 'healer', [sl], { mons: [[13, 3]], duo: true }).test());
    return fine && fine.need === '2+' && /^Waiting: needs 2 or more heroes/.test(fine.text) ? null : 'a healthy duo reads ' + JSON.stringify(fine);
  },
  'monsters-apart': (M) => {
    const sl = suggested(M, 'fireball');
    const f = fight(M, 'mage', [sl], { mons: [[12, 3], [12, 8]], monHp: 10000000 });
    if (casts(M, f, 100).fireball) return 'CONTROL: Fireball fired on two monsters five tiles apart';
    const said = M.W.waitReason(sl, 1, f.test());
    return said && /in its area/.test(said.text) && !/\bin range\b|\balone\b|\bone monster\b/.test(said.text) ? null : 'two far apart read ' + JSON.stringify(said && said.text);
  },
  'mana-threshold': (M) => {
    const bar = M.RS.ROLE_RULES.mage;
    const sl = slotOf('frost_lance', bar[1].conditions);
    const f = fight(M, 'mage', [sl], { mons: [[13, 3]], mana: 200, maxMana: 500 });
    const said = M.W.waitReason(sl, 1, f.test());
    if (!said || !said.rest || said.need || said.text !== 'Waiting until my mana is at least 70%.') return 'Frost Lance under 70% mana reads ' + JSON.stringify(said);
    if (casts(M, f, 100).frost_lance) return 'CONTROL: Frost Lance fired under 70% mana';
    const full = fight(M, 'mage', [sl], { mons: [[13, 3]], mana: 400, maxMana: 500 });
    if (M.W.waitReason(sl, 1, full.test()) !== null || !casts(M, full, 100).frost_lance) return 'Frost Lance over 70% mana does not simply fire';
    /* A count that isn't an "at least" (the player's own test) reads as it is, words only: never "2 or more". */
    const exact = slotOf('fireball', [{ metric: 'enemies_in_aoe', op: 'eq', value: 2 }]);
    const reads = M.W.waitReason(exact, 1, fight(M, 'mage', [exact], { mons: [[13, 3]] }).test());
    return reads && reads.rest && reads.text === 'Waiting until it would hit exactly 2 monsters.' ? null : 'exactly 2 reads ' + JSON.stringify(reads);
  },
  'every-suggestion': (M) => {
    const bad = [];
    for (const row of Object.values(M.AD.ABILITIES)) {
      const sl = suggested(M, row.id);
      for (const [name, o] of Object.entries(FIGHTS)) {
        const f = fight(M, roleOf(row), [sl], o);
        const words = M.F.aloneReason(sl, M.abilities.aloneIn(f.inst.world, f.me)) || M.W.waitReason(sl, f.party, f.test()) || M.F.holdingReason(sl, M.L.holdsPackOf(f.inst.world, 1));
        const fired = !!casts(M, f, 100)[row.id];
        if (fired && words) bad.push(row.id + ' in ' + name + ' fires and still says ' + JSON.stringify(words.text));
        if (!fired && !words) bad.push(row.id + ' in ' + name + ' does not fire and says nothing');
      }
    }
    return bad.length ? bad.join(' | ') : null;
  },
  'suggestions-readable': (M) => {
    const gaps = M.conditions.evaluatorGaps();
    if (gaps.missing.length || gaps.extra.length) return 'metrics with no evaluator ' + gaps.missing + ', evaluators with no metric ' + gaps.extra;
    const ids = new Set(M.CM.METRICS.map((m) => m.id));
    const named = [];
    for (const id of Object.keys(M.AD.ABILITIES)) for (const c of M.conditions.suggestedConditions({ type: 'ability', id })) named.push([id, c]);
    for (const id of Object.keys(M.CD.CONSUMABLES)) for (const c of M.conditions.suggestedConditions({ type: 'consume', id })) named.push([id, c]);
    for (const [role, rows] of Object.entries(M.RS.ROLE_RULES)) for (const s of rows) for (const c of s.conditions) named.push([role + '/' + s.action.id, c]);
    for (const s of M.KIT.START_BAR) for (const c of s.conditions) named.push(['start/' + s.action.id, c]);
    if (named.length < 20) return 'CONTROL: only ' + named.length + ' suggested conditions read';
    const wrong = named.filter(([, c]) => !ids.has(c.metric));
    if (wrong.length) return 'names a metric the engine can\'t read: ' + wrong.map(([who, c]) => who + ':' + c.metric).join(', ');
    /* Every metric and operator has words, in a slot held back by it (a fake test: nothing passes). */
    const none = () => ({ pass: false, mask: 0, ignored: false });
    const bad = [];
    for (const m of M.CM.METRICS) {
      const value = m.value === 'pct' ? 50 : m.value === 'count' ? 3 : m.value === 'bool' ? true : M.CM.EFFECT_IDS[0];
      const subjects = m.subject ? Object.keys(m.subject) : [undefined];
      for (const op of m.ops) for (const subject of subjects) {
        const c = Object.assign({ metric: m.id, op, value }, subject ? { subject } : {});
        const said = M.W.waitReason(slotOf('fireball', [c]), 4, none);
        if (!said || said.text.length < 16 || /undefined|null|NaN|[a-z]_[a-z]/.test(said.text)) bad.push(JSON.stringify(c) + ' reads ' + JSON.stringify(said && said.text));
      }
    }
    return bad.length ? bad.join(' | ') : null;
  },
  'between-pulls': (M) => {
    const sl = suggested(M, 'fireball');
    const f = fight(M, 'mage', [sl], { mons: [[13, 3]], idle: true });
    if (f.test() !== null) return 'a tester answers with nothing engaged';
    if (M.W.waitReason(sl, 1, null)) return 'in town Fireball reads as waiting';
    const down = fight(M, 'mage', [sl], { mons: [[13, 3]] });
    down.me.alive = false;
    return down.test() === null ? null : 'a tester answers for a hero who is down';
  },
  'display-only': (M) => {
    const sl = suggested(M, 'fireball'), ally = slotOf('greater_mend', [{ metric: 'ally_hp_pct', op: 'lt', value: 70, subject: 'lowest' }]);
    const f = fight(M, 'mage', [sl, ally], { mons: [[13, 3], [18, 7]], duo: true, hurt: true });
    const before = JSON.stringify(f.inst.world);
    const t = f.test();
    for (let i = 0; i < 50; i++) { t(sl); t(ally); M.W.waitReason(sl, 2, t); }
    return JSON.stringify(f.inst.world) === before ? null : 'asking why moved the world';
  },
  'ignored': (M) => {
    const sl = Object.assign(suggested(M, 'power_strike'), { ignore: ['rat'] });
    const f = fight(M, 'melee_dps', [sl], { mons: [[12, 3]] });
    f.me.target = 10;
    f.inst.world.units[1].kind = 'rat';
    const said = M.W.waitReason(sl, 1, f.test());
    return said && said.code === 'ignored' && !said.rest ? null : 'a slot ignoring its hero\'s target reads ' + JSON.stringify(said);
  },
  'order': (M) => {
    const facts = (o) => Object.assign({ set: { discipline: 'destruction', role: 'mage', store: [], slots: [] }, bag: [{ id: 'chalked_fire_rune', qty: 5 }, { id: 'chalked_ice_rune', qty: 5 }], hero: { mana: 500 }, worn: null, skills: null, pack: null, party: 1, holding: false, test: null }, o);
    const fire = suggested(M, 'fireball');
    const lone = fight(M, 'mage', [fire], { mons: [[13, 3]] }).test();
    /* An empty slot has nothing to test: asking the engine threw on every frame of a fight (played on the local world), and the bar stopped patching. */
    try { if (M.W.slotWhy({ empty: true }, facts({ test: lone })) !== null) return 'an empty slot has a reason'; } catch (e) { return 'an empty slot stops the bar: ' + e.message; }
    if (M.W.slotWhy(fire, facts({ test: lone })).code !== 'wait_enemies_in_aoe') return 'the lone monster\'s wait is not the answer';
    if (!M.W.slotWhy(fire, facts({ test: lone, bag: [] })).strike) return 'no rune is a strike: it must beat the wait';
    if (M.W.slotWhy(fire, facts({ test: lone, hero: { mana: 5 } })).code !== 'wait_enemies_in_aoe') return 'mana beat the marked wait';
    const lance = slotOf('frost_lance', M.RS.ROLE_RULES.mage[1].conditions);
    const low = fight(M, 'mage', [lance], { mons: [[13, 3]], mana: 5, maxMana: 500 }).test();
    if (M.W.slotWhy(lance, facts({ test: low, hero: { mana: 5 } })).code !== 'mana') return 'a wait the player can read beat mana';
    /* A press on a tank's Challenge on a phone reads Holding through the same answer. */
    const set = { discipline: 'shield', role: 'tank', store: [], slots: [] };
    return M.W.slotWhy(slotOf('challenge', []), facts({ set, holding: true })).code === 'holding' ? null : 'a tank holding the pack does not read Holding';
  },
  'alone-only': (M) => {
    const WORDS = 'Only when you hunt alone.';
    const alone = Object.values(M.AD.ABILITIES).filter((r) => r.alone).map((r) => r.id);
    if (alone.join() !== 'undertow') return 'the alone spells are ' + JSON.stringify(alone) + ', want Undertow alone: re-judge this case';
    const row = M.AD.ABILITIES.undertow;
    if (!row.disciplines.includes('restoration') || row.mana !== M.AD.ABILITIES.mend.mana || !row.dmg || row.target !== 'enemy') return 'Undertow is not the Healer’s single-target strike at a Mend’s mana: ' + JSON.stringify(row);
    const sl = slotOf('undertow', []);
    const facts = (alone) => ({ set: { discipline: 'restoration', role: 'healer', store: [], slots: [] }, bag: [{ id: 'chalked_water_rune', qty: 5 }], hero: { mana: 500 }, worn: null, skills: null, pack: null, party: alone ? 1 : 2, alone, holding: false, test: null });
    /* THE ENGINE: beside a living partner it never fires; with the partner dead it does (read at each cast). */
    const duo = fight(M, 'healer', [sl], { mons: [[13, 3]], duo: true });
    if (M.abilities.aloneIn(duo.inst.world, duo.me)) return 'a Healer beside a living partner reads alone';
    const party = casts(M, duo, 60000);
    if (party.undertow) return 'the engine cast Undertow ' + party.undertow + ' times beside a living partner';
    const said = M.W.slotWhy(sl, facts(false));
    if (!said || said.code !== 'alone' || !said.strike || said.text !== WORDS) return 'in a party the slot reads ' + JSON.stringify(said);
    const left = fight(M, 'healer', [sl], { mons: [[13, 3]], duo: true });
    left.inst.world.units[1].alive = false;
    if (!M.abilities.aloneIn(left.inst.world, left.me)) return 'a Healer whose partner died does not read alone';
    if (!casts(M, left, 100).undertow) return 'the partner dead, Undertow did not fire';
    if (M.W.slotWhy(sl, facts(true)) !== null) return 'alone, the slot still reads ' + JSON.stringify(M.W.slotWhy(sl, facts(true)));
    /* THE WORDS before the hunt: its card (the bar's tooltip and Configure action's), and Configure action's line in a party only. */
    if (M.F.factsOf({ type: 'ability', id: 'undertow' }).alone !== WORDS) return 'its card reads ' + JSON.stringify(M.F.factsOf({ type: 'ability', id: 'undertow' }).alone);
    const stray = Object.keys(M.AD.ABILITIES).filter((id) => id !== 'undertow' && M.F.factsOf({ type: 'ability', id }).alone);
    if (stray.length) return 'a spell that casts in a party says it does not: ' + stray.join(', ');
    const draft = { action: { type: 'ability', id: 'undertow' }, conditions: [], join: 'and' };
    if (M.W.setupNote(draft, 2) !== WORDS + ' It does nothing in a party.') return 'Configure action in a party reads ' + JSON.stringify(M.W.setupNote(draft, 2));
    return M.W.setupNote(draft, 1) === '' ? null : 'Configure action alone reads ' + JSON.stringify(M.W.setupNote(draft, 1));
  },
  'configure-note': (M) => {
    const draft = (id) => ({ action: { type: 'ability', id }, conditions: M.conditions.suggestedConditions({ type: 'ability', id }), join: 'and' });
    if (M.W.setupNote(draft('fireball'), 1) !== 'On a lone monster this slot waits and your hero fights on without it. To use it on one, remove this condition.') return 'Fireball\'s suggestion reads ' + JSON.stringify(M.W.setupNote(draft('fireball'), 1));
    if (!/you’re not in a party/.test(M.W.setupNote(draft('circle_of_renewal'), 1))) return 'a lone Healer\'s Circle reads ' + JSON.stringify(M.W.setupNote(draft('circle_of_renewal'), 1));
    if (M.W.setupNote(draft('circle_of_renewal'), 2) !== '') return 'a duo\'s Circle reads ' + JSON.stringify(M.W.setupNote(draft('circle_of_renewal'), 2));
    for (const id of ['frost_lance', 'power_strike', 'mend']) if (M.W.setupNote(draft(id), 1) !== '') return id + ' reads ' + JSON.stringify(M.W.setupNote(draft(id), 1));
    if (M.W.setupNote({ action: { type: 'consume', id: null }, conditions: [], join: 'and' }, 1) !== '') return 'a blank slot reads a note';
    /* The player's own numbers: three on the area, a test that can't happen, more than a single-target strike can ever reach. */
    const set = (id, c) => M.W.setupNote({ action: { type: 'ability', id }, conditions: [c], join: 'and' }, 1);
    if (!/^With fewer than 3 monsters/.test(set('fireball', { metric: 'enemies_in_aoe', op: 'gte', value: 3 }))) return 'three on the area reads ' + JSON.stringify(set('fireball', { metric: 'enemies_in_aoe', op: 'gte', value: 3 }));
    if (!/never gets to 2/.test(set('power_strike', { metric: 'enemies_in_aoe', op: 'gte', value: 2 }))) return 'a strike wanting 2 reads ' + JSON.stringify(set('power_strike', { metric: 'enemies_in_aoe', op: 'gte', value: 2 }));
    /* A Cleave hits up to three beside its hero (abilities.js maxHits): two is a crowd it can see, four never comes. */
    if (/never gets to/.test(set('cleave', { metric: 'enemies_in_aoe', op: 'gte', value: 2 }))) return 'a Cleave wanting 2 reads ' + JSON.stringify(set('cleave', { metric: 'enemies_in_aoe', op: 'gte', value: 2 }));
    if (!/reaches 3 monsters at most, so it never gets to 4/.test(set('cleave', { metric: 'enemies_in_aoe', op: 'gte', value: 4 }))) return 'a Cleave wanting 4 reads ' + JSON.stringify(set('cleave', { metric: 'enemies_in_aoe', op: 'gte', value: 4 }));
    return /never happens/.test(set('mend', { metric: 'self_hp_pct', op: 'lt', value: 0 })) ? null : 'below 0% HP reads ' + JSON.stringify(set('mend', { metric: 'self_hp_pct', op: 'lt', value: 0 }));
  },
};

const MUTANTS = [
  { name: 'a slot held back by a condition says nothing (the original bug)', case: 'lone-monster',
    edits: [['src/shell/slot-waits.js', '  if (!t || t.pass) return null;\n', '  if (t || !t) return null;\n']] },
  { name: 'the engine\'s test is never asked', case: 'every-suggestion',
    edits: [['src/shell/slot-waits.js', '  const t = test ? test(sl) : null;\n', '  const t = null;\n']] },
  { name: 'the area wait asks for one more monster than the slot does', case: 'lone-monster',
    edits: [['src/shell/slot-waits.js', "const atLeast = (c) => (c.op === 'gte' ? c.value : c.op === 'gt' ? c.value + 1 : null);", "const atLeast = (c) => (c.op === 'gte' ? c.value + 1 : c.op === 'gt' ? c.value + 1 : null);"]] },
  { name: 'a test for exactly 2 reads as "2 or more"', case: 'mana-threshold',
    edits: [['src/shell/slot-waits.js', "const atLeast = (c) => (c.op === 'gte' ? c.value : c.op === 'gt' ? c.value + 1 : null);", "const atLeast = (c) => (c.op === 'gte' || c.op === 'eq' ? c.value : c.op === 'gt' ? c.value + 1 : null);"]] },
  { name: 'a lone hero is not told (the ceiling is gone)', case: 'lone-hero',
    edits: [['src/shell/slot-waits.js', "  if (c.metric === 'allies_below') return party;\n", '']] },
  { name: 'a wait the player can read marks the slot', case: 'mana-threshold',
    edits: [['src/shell/slot-waits.js', "strike: false, quiet: true, rest: true };", "strike: false, quiet: true };"]] },
  { name: 'a wait says it is waiting while the slot fires', case: 'every-suggestion',
    edits: [['src/shell/slot-waits.js', "  const failing = conds.filter((c, i) => !(t.mask & (1 << i)));\n", "  const failing = conds;\n"], ['src/shell/slot-waits.js', '  if (!t || t.pass) return null;\n', '  if (!t) return null;\n']] },
  { name: 'a fight with nothing engaged reads as waiting', case: 'between-pulls',
    edits: [['src/hunt-view/live-engine.js', '  if (!u || !u.alive || !engaged(inst).length) return null;\n  const h = { hs: member.hs', '  if (!u || !u.alive) return null;\n  const h = { hs: member.hs']] },
  { name: 'the tester writes to the world it reads', case: 'display-only',
    edits: [['src/hunt-view/live-engine.js', '    const t = testSlot(inst, u, h, slot);\n', '    const t = testSlot(inst, u, h, slot);\n    u.mana -= 1;\n']] },
  { name: 'the words read a different footprint from the slot\'s', case: 'configure-note',
    edits: [['src/shell/slot-waits.js', "  if (c.metric === 'enemies_in_aoe') return areaTopOf(slot, null);\n", '']] },
  { name: 'a slot ignoring its hero\'s target is read as a failed condition', case: 'ignored',
    edits: [['src/hunt-view/live-engine.js', 'ignored: aimsAtMonsters(slot) && ignores(slot, target) };', 'ignored: false };']] },
  { name: 'an empty slot asks the engine (every frame of a fight threw)', case: 'order',
    edits: [['src/shell/slot-waits.js', '  if (!sl || sl.empty || !Array.isArray(sl.conditions)) return null;\n  const conds = sl.conditions;\n', "  const conds = sl && !sl.empty && Array.isArray(sl.conditions) ? sl.conditions : [];\n"]] },
  { name: 'mana is named ahead of a marked wait', case: 'order',
    edits: [['src/shell/slot-waits.js', '  if (w && !w.rest) return w;\n', '']] },
  { name: 'Configure action says nothing about a lone monster', case: 'configure-note',
    edits: [['src/shell/slot-waits.js', "    if (need === 2) return 'On a lone monster this slot waits and your hero fights on without it. To use it on one, remove this condition.';\n", '']] },
  { name: 'a suggestion names a metric the engine can\'t read', case: 'suggestions-readable',
    edits: [['src/data/abilities.js', "return [{ metric: 'enemies_in_aoe', op: 'gte', value: ABILITY_RULES.areaMin }];", "return [{ metric: 'enemies_near', op: 'gte', value: ABILITY_RULES.areaMin }];"]] },
  { name: 'a metric has no words', case: 'suggestions-readable',
    edits: [['src/shell/slot-waits.js', "  return { code: 'wait_until', text: 'Waiting until ' + conditionWords(c) + '.', glyph: 'uiHourglass', strike: false, quiet: true, rest: true };\n", '  return null;\n']] },
  { name: 'the Mage\'s default fires on one (re-judge: a default the display no longer has to explain)', case: 'lone-monster',
    edits: [['src/data/abilities.js', '  areaMin: 2,\n', '  areaMin: 1,\n']] },
  { name: '[alone] the engine casts Undertow in a party', case: 'alone-only',
    edits: [['src/core/hunt/abilities.js', '    && (solo || !(ABILITIES[r.slot.action.id] && ABILITIES[r.slot.action.id].alone)));', '    && (solo || true));']] },
  { name: '[alone] a dead partner still counts as company', case: 'alone-only',
    edits: [['src/core/hunt/abilities.js', "!world.units.some((o) => o !== hero && o.side === 'hero' && o.alive === true);", "!world.units.some((o) => o !== hero && o.side === 'hero');"]] },
  { name: '[alone] the slot in a party says nothing', case: 'alone-only',
    edits: [['src/shell/slot-waits.js', '  if (a) return a;\n', '']] },
  { name: '[alone] the card loses the callout', case: 'alone-only',
    edits: [['src/shell/action-facts.js', "alone: r.alone ? t('bar.alone') : null };", 'alone: null };']] },
  { name: '[alone] Configure action says nothing in a party', case: 'alone-only',
    edits: [['src/shell/slot-waits.js', '  if (alone) return alone;\n', '']] },
  { name: 'an ability whose target rule stops finding a target, and no words say so', case: 'every-suggestion',
    edits: [['src/core/hunt/abilities.js', "    case 'mark': {\n", "    case 'mark': return null;\n    case 'mark_old': {\n"]] },
];

const R = makeReport('hunt-core/silent-triggers');
const M = await load(ROOT);
for (const [name, fn] of Object.entries(cases)) {
  let why = null;
  try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, name + ': ' + why);
}
if (!process.argv.includes('--no-mutate')) {
  for (const mu of MUTANTS) {
    if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
    const p = plant(mu.edits, ['src']);
    try {
      let why = null;
      try { why = cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
      R.ok(!!why && !why.startsWith('CONTROL') && !why.startsWith('threw'), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + ' (' + why + ')');
    } finally { p.done(); }
  }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + MUTANTS.length + ' mutants caught');
R.finish();
