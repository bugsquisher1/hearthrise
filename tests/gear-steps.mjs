#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/gear-steps.mjs — PLAIN GEAR IN STEPS AND THE FIRST FIVE TRAITS ARE WELL-FORMED, AND THE TRAITS STAY HIDDEN
// (designer, lane/g-gear-steps 2026-11-22; src/data/gear-steps.js, 04-math-strategy.md section 10, 12-targets.md sections 3.3 and 8).
//
//   GS-1  THE SLOT WEIGHTS: one positive whole permille for every equip slot (src/data/gathering.js EQUIP_SLOTS, ammo excluded) and no
//         other, summing to exactly 1000, so a whole kit at item Level X is a gear part of X. A two-handed weapon names real slots
//   GS-2  THE TIER: tierSteps a positive whole number, tierLevel(t) = t x tierSteps, wearAhead whole and inside one tier
//   GS-3  THE TRAIT BUDGET (04 section 10's five guards as numbers): three ranks rising, rank 1 to rank 3 under a third of a tier (so a
//         rank 3 on an old base loses to a rank 1 on the next), conditionalStepsMax at least rank 3 and at most a tier, the average
//         share and the dominance share inside (0, 1000), three rank depths starting at depth 1 inside the band, pity on the Rare roll
//   GS-4  A TRAIT IS A RULE: a name of its own (no item, no other Trait, no filler word), a real slot, offense / defense / heal, a scope,
//         a `when` in the bar's own conditions (a known metric, one of its operators, a value its picker allows, a known subject) and
//         never the always-true one (in_fight: a rule that is always on is a number), its best seat a real seat on its own source,
//         a source that is a scale ground or one of the two Catacomb wings, `{steps}` in its words, plain text (no semicolon, no dash)
//   GS-5  THE SAMPLE: about five, each on its own slot, each key its own; every scale ground's gearLevel is a whole tier and its
//         traits are exactly its pool
//   GS-6  HIDDEN: the only file under src/ or supabase/functions/ that imports gear-steps.js is src/data/danger.js (and the generated
//         preload list src/app/game-modules.js), and no other src
//         file names a Trait's id or name (no drop table, item, text or screen)
//
//   node tests/gear-steps.mjs            the guard
//   node tests/gear-steps.mjs --mutate   each rule driven red by a defect planted on a copy of the data
//
// mutant-anchors: none — every mutant edits an in-memory copy of the rows (structuredClone), never a file
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import { GEAR_STEPS, TRAITS, tierLevel, traitPool } from '../src/data/gear-steps.js';
import { DANGER_GROUNDS, DEPTHS } from '../src/data/danger.js';
import { EQUIP_SLOTS } from '../src/data/gathering.js';
import { METRICS, OPERATORS } from '../src/data/condition-metrics.js';
import { HUNT_ROLES } from '../src/data/hunt-roles.js';
import { ITEMS } from '../src/data/items.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* the two grounds 12-targets.md section 7 makes of the Catacombs in wave 2; a Trait may name them before their rows exist */
const PLANNED_SOURCES = Object.freeze(['catacomb_bone_wing', 'catacomb_flooded_wing']);
const RAISES = new Set(['offense', 'defense', 'heal']);
const SCOPES = new Set(['self', 'party']);
const BANNED = /\b(shadow|void|ancient|eternal|dark|forgotten)\b|of doom|of the abyss/i;
const SAMPLE = [4, 6];
/* who may name gear-steps.js: the scale's grounds (gearLevel, traits) and the generated preload list (tests/module-preload.mjs --write) */
const IMPORTERS = new Set(['src/data/danger.js', 'src/app/game-modules.js']);

function srcFiles() {
  const out = new Map();
  const walk = (abs, rel) => {
    for (const e of readdirSync(abs)) {
      const a = join(abs, e), r = rel + '/' + e;
      if (statSync(a).isDirectory()) walk(a, r);
      else if (/\.(m?js|ts)$/.test(e)) out.set(r, readFileSync(a, 'utf8'));
    }
  };
  walk(join(ROOT, 'src'), 'src');
  walk(join(ROOT, 'supabase', 'functions'), 'supabase/functions');
  return out;
}

/** Every problem with the rows. Pure on its argument, so --mutate plants on a copy. */
export function problems(d) {
  const out = [];
  const G = d.GEAR_STEPS;
  /* GS-1 */
  const slots = d.EQUIP_SLOTS.filter((s) => s !== 'ammo');
  const pm = G.slotPm || {};
  for (const s of slots) if (!Number.isInteger(pm[s]) || pm[s] <= 0) out.push('GS-1 slot ' + s + ' has no positive whole permille');
  for (const s of Object.keys(pm)) if (!slots.includes(s)) out.push('GS-1 ' + s + ' is not an equip slot');
  const sum = Object.values(pm).reduce((a, b) => a + b, 0);
  if (sum !== 1000) out.push('GS-1 the slot weights sum to ' + sum + ', not 1000');
  if (!Array.isArray(G.twoHand) || !G.twoHand.length || !G.twoHand.every((s) => pm[s])) out.push('GS-1 twoHand names a slot with no weight');
  /* GS-2 */
  if (!Number.isInteger(G.tierSteps) || G.tierSteps <= 0) out.push('GS-2 tierSteps is not a positive whole number');
  for (const t of [0, 1, 3, 9]) if (d.tierLevel(t) !== t * G.tierSteps) out.push('GS-2 tierLevel(' + t + ') is not ' + t + ' x tierSteps');
  if (!Number.isInteger(G.wearAhead) || G.wearAhead < 0 || G.wearAhead > G.tierSteps) out.push('GS-2 wearAhead is not whole inside one tier');
  /* GS-3 */
  const ts = G.traitSteps || [];
  if (ts.length !== 3 || !ts.every((x, i) => Number.isInteger(x) && x > 0 && (i === 0 || x > ts[i - 1]))) out.push('GS-3 traitSteps is not three rising whole ranks');
  else if ((ts[2] - ts[0]) * 3 >= G.tierSteps) out.push('GS-3 rank 1 to rank 3 spans a third of a tier or more');
  if (!(G.conditionalStepsMax >= ts[2] && G.conditionalStepsMax <= G.tierSteps)) out.push('GS-3 conditionalStepsMax is under rank 3 or over a tier');
  for (const k of ['traitAverageSharePm', 'dominanceMaxPm']) if (!(Number.isInteger(G[k]) && G[k] > 0 && G[k] < 1000)) out.push('GS-3 ' + k + ' is not inside (0, 1000)');
  const rd = G.rankDepths || [];
  if (rd.length !== ts.length || rd[0] !== 1 || !rd.every((x, i) => Number.isInteger(x) && x <= d.DEPTHS && (i === 0 || x > rd[i - 1]))) out.push('GS-3 rankDepths is not one rising start a rank from depth 1');
  if (!G.pity || G.pity.rare !== true) out.push('GS-3 the Rare roll has no pity');
  /* GS-4 */
  const metrics = new Map(d.METRICS.map((m) => [m.id, m]));
  const itemNames = new Set(Object.values(d.ITEMS).map((i) => String(i.n || '').toLowerCase()));
  const names = new Set();
  const sources = new Set([...Object.keys(d.DANGER_GROUNDS), ...PLANNED_SOURCES]);
  for (const [id, t] of Object.entries(d.TRAITS)) {
    const at = 'GS-4 ' + id + ': ';
    const name = String(t.name || '');
    if (!name) out.push(at + 'no name');
    if (names.has(name.toLowerCase())) out.push(at + 'a name another Trait has');
    if (itemNames.has(name.toLowerCase())) out.push(at + 'a name an item has');
    names.add(name.toLowerCase());
    if (BANNED.test(name) || BANNED.test(t.rule || '') || BANNED.test(t.story || '')) out.push(at + 'a banned filler word');
    if (!pm[t.slot]) out.push(at + 'slot ' + t.slot + ' has no weight');
    if (!RAISES.has(t.raises)) out.push(at + 'raises ' + t.raises);
    if (!SCOPES.has(t.scope)) out.push(at + 'scope ' + t.scope);
    if (!t.key) out.push(at + 'no stacking key');
    const w = t.when || {}, m = metrics.get(w.metric);
    if (!m) out.push(at + 'when names no bar condition (' + w.metric + ')');
    else {
      if (m.id === 'in_fight') out.push(at + 'when is always true in a fight: a number, not a rule');
      if (!m.ops.includes(w.op) || !d.OPERATORS[w.op]) out.push(at + 'operator ' + w.op + ' is not one ' + m.id + ' takes');
      if (m.value === 'bool' && typeof w.value !== 'boolean') out.push(at + 'a yes/no condition with value ' + w.value);
      if ((m.value === 'pct' || m.value === 'count') && !(Number.isInteger(w.value) && w.value >= m.range[0] && w.value <= m.range[1])) out.push(at + 'value ' + w.value + ' outside ' + m.id + '\'s picker');
      if (m.value === 'effect') out.push(at + 'an effect condition needs an effect id (none in the sample)');
      if (w.subject !== undefined && !(m.subject && Object.prototype.hasOwnProperty.call(m.subject, w.subject))) out.push(at + 'subject ' + w.subject + ' is not one ' + m.id + ' takes');
    }
    if (!sources.has(t.source)) out.push(at + 'source ' + t.source + ' is no scale ground or Catacomb wing');
    if (!t.best || !d.HUNT_ROLES[t.best.seat]) out.push(at + 'best seat is not a seat');
    if (!t.best || t.best.ground !== t.source) out.push(at + 'sized on a ground it does not roll on');
    if (!String(t.rule || '').includes('{steps}')) out.push(at + 'its words do not say its steps');
    if (!t.story) out.push(at + 'no story');
    if (/[;—–]/.test((t.rule || '') + (t.story || ''))) out.push(at + 'a semicolon or a dash in player text');
  }
  /* GS-5 */
  const rows = Object.values(d.TRAITS);
  if (rows.length < SAMPLE[0] || rows.length > SAMPLE[1]) out.push('GS-5 ' + rows.length + ' Traits: a sample is about five');
  if (new Set(rows.map((t) => t.slot)).size !== rows.length) out.push('GS-5 two sample Traits share a slot');
  if (new Set(rows.map((t) => t.key)).size !== rows.length) out.push('GS-5 two sample Traits share a stacking key');
  for (const [gid, g] of Object.entries(d.DANGER_GROUNDS)) {
    if (!Number.isInteger(g.gearLevel) || g.gearLevel <= 0 || g.gearLevel % G.tierSteps) out.push('GS-5 ' + gid + ' gearLevel is not a whole tier');
    const pool = Object.keys(d.TRAITS).filter((id) => d.TRAITS[id].source === gid);
    if (JSON.stringify([...(g.traits || [])].sort()) !== JSON.stringify(pool.sort())) out.push('GS-5 ' + gid + ' traits are not its pool');
  }
  /* GS-6 */
  for (const [rel, text] of d.files) {
    if (rel === 'src/data/gear-steps.js') continue;
    if (/gear-steps\.js/.test(text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')) && !IMPORTERS.has(rel)) out.push('GS-6 ' + rel + ' imports gear-steps.js');
    for (const [id, t] of Object.entries(d.TRAITS)) {
      if (new RegExp('[\'"`]' + id + '[\'"`]').test(text) || text.includes(t.name)) out.push('GS-6 ' + rel + ' names the hidden Trait ' + id);
    }
  }
  return out;
}

const real = () => ({ GEAR_STEPS, TRAITS, tierLevel, traitPool, DANGER_GROUNDS, DEPTHS, EQUIP_SLOTS, METRICS, OPERATORS, HUNT_ROLES, ITEMS, files: srcFiles() });
const copy = (d) => ({ ...d, GEAR_STEPS: structuredClone(d.GEAR_STEPS), TRAITS: structuredClone(d.TRAITS), DANGER_GROUNDS: structuredClone(d.DANGER_GROUNDS), files: new Map(d.files) });

const MUTANTS = [
  ['GS-1 a slot weight off', (d) => { d.GEAR_STEPS.slotPm.weapon += 10; }],
  ['GS-1 a slot missing', (d) => { delete d.GEAR_STEPS.slotPm.earrings; d.GEAR_STEPS.slotPm.weapon += 40; }],
  ['GS-1 a slot that is no slot', (d) => { d.GEAR_STEPS.slotPm.tail = 10; d.GEAR_STEPS.slotPm.weapon -= 10; }],
  ['GS-1 two-handed names no slot', (d) => { d.GEAR_STEPS.twoHand = ['weapon', 'offhand']; }],
  ['GS-2 tierLevel off by a tier', (d) => { d.tierLevel = (t) => (t + 1) * d.GEAR_STEPS.tierSteps; }],
  ['GS-2 wearAhead past a tier', (d) => { d.GEAR_STEPS.wearAhead = d.GEAR_STEPS.tierSteps + 1; }],
  ['GS-3 rank spread a third of a tier', (d) => { d.GEAR_STEPS.traitSteps = [2, 5, 9]; }],
  ['GS-3 ranks not rising', (d) => { d.GEAR_STEPS.traitSteps = [4, 4, 6]; }],
  ['GS-3 conditional cap over a tier', (d) => { d.GEAR_STEPS.conditionalStepsMax = d.GEAR_STEPS.tierSteps + 1; }],
  ['GS-3 average share at 1000', (d) => { d.GEAR_STEPS.traitAverageSharePm = 1000; }],
  ['GS-3 rank depths not from 1', (d) => { d.GEAR_STEPS.rankDepths = [2, 8, 15]; }],
  ['GS-3 no pity', (d) => { d.GEAR_STEPS.pity = { rare: false }; }],
  ['GS-4 an item\'s name', (d) => { d.TRAITS.floodmark.name = Object.values(d.ITEMS)[0].n; }],
  ['GS-4 a filler word', (d) => { d.TRAITS.floodmark.name = 'Dark Floodmark'; }],
  ['GS-4 always on', (d) => { d.TRAITS.last_file.when = { metric: 'in_fight', op: 'eq', value: true }; }],
  ['GS-4 an unknown metric', (d) => { d.TRAITS.last_file.when.metric = 'moon_is_full'; }],
  ['GS-4 a wrong operator', (d) => { d.TRAITS.captains_due.when.op = 'gte'; }],
  ['GS-4 a value outside the picker', (d) => { d.TRAITS.last_file.when.value = 140; }],
  ['GS-4 a subject the metric lacks', (d) => { d.TRAITS.floodmark.when.subject = 'everyone'; }],
  ['GS-4 a source that is nowhere', (d) => { d.TRAITS.file_breaker.source = 'the_moon'; d.TRAITS.file_breaker.best.ground = 'the_moon'; }],
  ['GS-4 sized on another ground', (d) => { d.TRAITS.file_breaker.best.ground = 'catacomb_bone_wing'; }],
  ['GS-4 a seat that is no seat', (d) => { d.TRAITS.keepers_carry.best.seat = 'bard'; }],
  ['GS-4 raises nothing known', (d) => { d.TRAITS.keepers_carry.raises = 'luck'; }],
  ['GS-4 words without steps', (d) => { d.TRAITS.keepers_carry.rule = 'Heals more.'; }],
  ['GS-4 a semicolon', (d) => { d.TRAITS.keepers_carry.story += '; and more'; }],
  ['GS-5 two on one slot', (d) => { d.TRAITS.floodmark.slot = 'helmet'; }],
  ['GS-5 two of one key', (d) => { d.TRAITS.floodmark.key = 'low_hp'; }],
  ['GS-5 a ground off the tier', (d) => { d.DANGER_GROUNDS.muster_barrows.gearLevel += 5; }],
  ['GS-5 a pool that drops a Trait', (d) => { d.DANGER_GROUNDS.muster_barrows.traits = ['file_breaker']; }],
  ['GS-6 a screen imports it', (d) => { d.files.set('src/shell/x.js', "import { TRAITS } from '../data/gear-steps.js';"); }],
  ['GS-6 a drop names a Trait', (d) => { d.files.set('src/data/grounds/x/pack.js', "drops: [{ id: 'floodmark' }]"); }],
];

if (isMain(import.meta.url)) {
  const d = real();
  if (process.argv.includes('--mutate')) {
    let missed = 0;
    for (const [name, plant] of MUTANTS) {
      const c = copy(d); plant(c);
      const p = problems(c);
      const tag = name.slice(0, 4);
      const caught = p.some((x) => x.startsWith(tag));
      console.log((caught ? '✓ caught ' : '✗ MISSED ') + name + (caught ? '' : ' (' + p.join(' | ') + ')'));
      if (!caught) missed++;
    }
    console.log(missed ? missed + ' of ' + MUTANTS.length + ' mutants missed' : 'all ' + MUTANTS.length + ' mutants caught');
    process.exit(missed ? 1 : 0);
  }
  const p = problems(d);
  for (const x of p) console.log('✗ ' + x);
  console.log(p.length ? p.length + ' problem(s)' : '✓ gear-steps: slots, tier, budget, five Traits well-formed and hidden');
  process.exit(p.length ? 1 : 0);
}
