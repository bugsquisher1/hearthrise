#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/gear-steps.mjs — PLAIN GEAR IN STEPS AND THE 40 TRAITS ARE WELL-FORMED, AND THE TRAITS STAY HIDDEN
// (designer, lane/g-gear-steps and lane/traits-20 2026-11-22; src/data/gear-steps.js, src/data/traits.js, 04-math-strategy.md section 10,
// 12-targets.md sections 3.3 and 8, docs/design/redesign/14-trait-candidates.md: Tyler picked all 40).
//
//   GS-1  THE SLOT WEIGHTS: one positive whole permille for every equip slot (src/data/gathering.js EQUIP_SLOTS, ammo excluded) and no
//         other, summing to exactly 1000, so a whole kit at item Level X is a gear part of X. A two-handed weapon names real slots
//   GS-2  THE TIER: tierSteps a positive whole number, tierLevel(t) = t x tierSteps, wearAhead whole and inside one tier
//   GS-3  THE TRAIT BUDGET (04 section 10's five guards as numbers): three ranks rising, rank 1 to rank 3 under a third of a tier (so a
//         rank 3 on an old base loses to a rank 1 on the next), conditionalStepsMax at least rank 3 and at most a tier, the average
//         share and the dominance share inside (0, 1000), three rank depths starting at depth 1 inside the band, pity on the Rare roll,
//         a trade's gain ranks rising, each over its cost, its net at most one rank and its gain under the cap, and every percent a
//         tooltip shows within a quarter of a point of its steps at the Danger scale's powerStep (the steps are the source)
//   GS-4  A TRAIT IS A RULE: a name of its own (no item, no other Trait, no filler word), a Trait slot whose equip slots have weight,
//         offense / defense / heal, a scope, a `when` in the bar's own conditions (a known metric, one of its operators, a value its
//         picker allows, a known subject, a real effect) and never the always-true one (in_fight: a rule that is always on is a
//         number), its best seat a real seat on its own source, a source that is a hunting ground or a Catacomb wing, a tooltip in the
//         genre style ('+{pct}%' or '−{pct}%' by what it raises, 'Party: ' exactly when party-wide, '{gain}' exactly on a trade, no
//         sentence, no semicolon, no dash), a trade only on offense, and a Trait that pays for running low (item_qty at most or under)
//         counts only on a hunt started with at least twice its threshold
//   GS-5  THE POOL: the 40 of 14-trait-candidates.md by number, name and ground; every Trait slot holds 2 or more Traits of 2 or more
//         keys (so a Very Rare can roll), every similar group the doc lists shares one key, no Very Rare pair shares a key, every
//         ground's pool serves 2 or more seats; every scale ground's gearLevel is a whole tier and its traits are exactly its pool
//   GS-6  HIDDEN: the only file under src/ or supabase/functions/ that imports gear-steps.js is src/data/danger.js, the only one that
//         imports traits.js is gear-steps.js (the generated preload list src/app/game-modules.js may name both), and no other src
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
import { GEAR_STEPS, tierLevel } from '../src/data/gear-steps.js';
import { TRAITS, traitPool } from '../src/data/traits.js';
import { DANGER, DANGER_GROUNDS, DEPTHS } from '../src/data/danger.js';
import { GROUND_PACKS } from '../src/data/grounds/index.js';
import { EQUIP_SLOTS } from '../src/data/gathering.js';
import { METRICS, OPERATORS, EFFECT_IDS } from '../src/data/condition-metrics.js';
import { HUNT_ROLES } from '../src/data/hunt-roles.js';
import { ITEMS } from '../src/data/items.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* the two grounds 12-targets.md section 7 makes of the Catacombs in wave 2; a Trait may name them before their rows exist */
const PLANNED_SOURCES = Object.freeze(['catacomb_bone_wing', 'catacomb_flooded_wing']);
const RAISES = new Set(['offense', 'defense', 'heal']);
const SCOPES = new Set(['self', 'party']);
const MOVES = new Set(['area', 'spell', 'ranged']);
const BANNED = /\b(shadow|void|ancient|eternal|dark|forgotten)\b|of doom|of the abyss/i;
/* who may name each file: the scale's grounds read the gear table, the gear table re-exports the Traits, and the generated preload list */
const IMPORTERS = Object.freeze({
  'gear-steps.js': new Set(['src/data/danger.js', 'src/app/game-modules.js']),
  'traits.js': new Set(['src/data/gear-steps.js', 'src/app/game-modules.js']),
});
const HOMES = new Set(['src/data/gear-steps.js', 'src/data/traits.js']);
/* the doc's words for a ground and a slot heading */
const DOC_GROUNDS = Object.freeze({
  'Muster Barrows': 'muster_barrows', 'Pyre Field': 'pyre_field', 'Krell\'s Hold': 'krells_hold', 'Carter\'s Rest': 'carters_rest',
  'Ox Road': 'ox_road', 'Wyvern Roost': 'wyvern_roost', 'Bone Wing': 'catacomb_bone_wing', 'Flooded Wing': 'catacomb_flooded_wing',
});
const DOC_SLOTS = Object.freeze({ Weapon: 'weapon', Shield: 'shield', Body: 'body', Legs: 'pants', Helmet: 'helmet', Boots: 'boots',
  Gloves: 'gloves', Belt: 'belt', Cape: 'cape', Necklace: 'necklace', Ring: 'ring', Earrings: 'earrings' });

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

/** THE VERY RARE PAIR RULE as the roller (wave 4) will play it (12-targets 8.1): the pairs a Very Rare of `slot` found on `source`
    may carry. The first Trait from that ground's pool for the slot, the second any other Trait of the slot, never two of one key,
    never a banned pair. Pure on its arguments. */
export function veryRarePairs(traits, banned, source, slot) {
  const ofSlot = Object.keys(traits).filter((id) => traits[id].slot === slot);
  const seen = new Set();
  for (const a of ofSlot.filter((id) => traits[id].source === source)) {
    for (const b of ofSlot) {
      const tag = [a, b].sort().join('+');
      if (a !== b && traits[a].key !== traits[b].key && !banned.includes(tag)) seen.add(tag);
    }
  }
  return [...seen].sort().map((tag) => tag.split('+'));
}

/** The candidates doc as rows: { n, name, slot, source } by number, and the similar groups as lists of numbers. */
export function readDoc(text) {
  const rows = new Map();
  let slot = null;
  for (const line of text.split(/\r?\n/)) {
    const h = /^## (\w+)\s*$/.exec(line);
    if (h) slot = DOC_SLOTS[h[1]] || null;
    const m = /^\*\*(\d+)\. (.+?)(?: ✓)?\*\* · (.+?)\s*$/.exec(line);
    if (m) rows.set(Number(m[1]), { name: m[2], slot, source: DOC_GROUNDS[m[3]] || m[3] });
  }
  const similar = [];
  const at = text.indexOf('## Similar pairs');
  if (at >= 0) {
    for (const line of text.slice(at).split(/\r?\n/).slice(1)) {
      if (/^## /.test(line)) break;
      const ns = [...line.matchAll(/#(\d+)/g)].map((x) => Number(x[1]));
      if (ns.length > 1) similar.push(ns);
    }
  }
  return { rows, similar };
}

const pctOf = (steps, powerStep) => (Math.pow(1 + powerStep, steps) - 1) * 100;

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
  /* the piece's rarity criterion (13-market.md 2.3): a Rare one Trait, a Very Rare two, and every Trait on one slot only */
  const tb = G.traitsByRarity || {};
  if (tb.rare !== 1 || tb.very_rare !== 2 || Object.keys(tb).length !== 2) out.push('GS-3 traitsByRarity is not a Rare 1, a Very Rare 2');
  /* a trade: gain rising, over its cost, its net at most one rank, its gain under the conditional cap */
  const tr = G.tradeSteps || [];
  if (tr.length !== 3 || !tr.every((x, i) => Number.isInteger(x) && x > ts[i] && x - ts[i] <= ts[i] && (i === 0 || x > tr[i - 1]))) out.push('GS-3 tradeSteps is not three rising gains, each over its cost with its net at most one rank');
  else if (tr[2] > G.conditionalStepsMax) out.push('GS-3 a trade\'s rank 3 gain is over conditionalStepsMax');
  /* what the card shows, against the steps it rounds */
  const shown = G.shownPct || {};
  for (const [k, steps] of [['rank', ts], ['tradeGain', tr]]) {
    const p = shown[k] || [];
    if (p.length !== 3 || !p.every((x, i) => Math.abs(x - pctOf(steps[i], d.DANGER.powerStep)) <= 0.25)) out.push('GS-3 shownPct.' + k + ' is not within a quarter point of its steps');
  }
  /* GS-4 */
  const metrics = new Map(d.METRICS.map((m) => [m.id, m]));
  const itemNames = new Set(Object.values(d.ITEMS).map((i) => String(i.n || '').toLowerCase()));
  const names = new Set();
  const sources = new Set([...Object.keys(d.DANGER_GROUNDS), ...d.GROUND_PACKS.map((p) => p.id), ...PLANNED_SOURCES]);
  for (const [s, eqs] of Object.entries(G.traitSlots)) {
    if (!Array.isArray(eqs) || !eqs.length || !eqs.every((e) => pm[e])) out.push('GS-4 Trait slot ' + s + ' names an equip slot with no weight');
  }
  const covered = new Set(Object.values(G.traitSlots).flat());
  for (const s of slots) if (!covered.has(s)) out.push('GS-4 equip slot ' + s + ' has no Trait slot');
  for (const [id, t] of Object.entries(d.TRAITS)) {
    const at = 'GS-4 ' + id + ': ';
    const name = String(t.name || '');
    if (!name) out.push(at + 'no name');
    if (names.has(name.toLowerCase())) out.push(at + 'a name another Trait has');
    if (itemNames.has(name.toLowerCase())) out.push(at + 'a name an item has');
    names.add(name.toLowerCase());
    if (BANNED.test(name) || BANNED.test(t.tip || '')) out.push(at + 'a banned filler word');
    if (!G.traitSlots[t.slot]) out.push(at + 'slot ' + t.slot + ' is no Trait slot');
    if (!RAISES.has(t.raises)) out.push(at + 'raises ' + t.raises);
    if (!SCOPES.has(t.scope)) out.push(at + 'scope ' + t.scope);
    if (t.move !== undefined && !MOVES.has(t.move)) out.push(at + 'move ' + t.move + ' is no kind of move');
    if (!t.key) out.push(at + 'no stacking key');
    const w = t.when || {}, m = metrics.get(w.metric);
    if (!m) out.push(at + 'when names no bar condition (' + w.metric + ')');
    else {
      if (m.id === 'in_fight') out.push(at + 'when is always true in a fight: a number, not a rule');
      if (!m.ops.includes(w.op) || !d.OPERATORS[w.op]) out.push(at + 'operator ' + w.op + ' is not one ' + m.id + ' takes');
      if (m.value === 'bool' && typeof w.value !== 'boolean') out.push(at + 'a yes/no condition with value ' + w.value);
      if ((m.value === 'pct' || m.value === 'count') && !(Number.isInteger(w.value) && w.value >= m.range[0] && w.value <= m.range[1])) out.push(at + 'value ' + w.value + ' outside ' + m.id + '\'s picker');
      if (m.value === 'effect' && !d.EFFECT_IDS.includes(w.value)) out.push(at + 'an effect condition on ' + w.value + ', no status');
      if (w.subject !== undefined && !(m.subject && Object.prototype.hasOwnProperty.call(m.subject, w.subject))) out.push(at + 'subject ' + w.subject + ' is not one ' + m.id + ' takes');
      /* running low pays only on a hunt that started well stocked (#36: never "pack 50 arrows and it is always on") */
      if (m.id === 'item_qty' && (w.op === 'lte' || w.op === 'lt')) {
        const sm = t.startMin;
        if (!sm || sm.subject !== w.subject || !(Number.isInteger(sm.value) && sm.value >= 2 * w.value)) out.push(at + 'pays for running low with no start floor of twice its threshold');
      }
    }
    if (!sources.has(t.source)) out.push(at + 'source ' + t.source + ' is no hunting ground or Catacomb wing');
    if (!t.best || !d.HUNT_ROLES[t.best.seat]) out.push(at + 'best seat is not a seat');
    if (!t.best || t.best.ground !== t.source) out.push(at + 'sized on a ground it does not roll on');
    /* the tooltip, genre style (the Coordinator 2026-11-22: "+1.5 / 2.5 / 3.5% damage vs bosses", no invented verbs, no sentences) */
    const tip = String(t.tip || '');
    const body = tip.replace(/^Party: /, '');
    if (t.scope === 'party' !== tip.startsWith('Party: ')) out.push(at + 'its tooltip says Party exactly when it is not party-wide');
    if (t.trade) {
      if (t.raises !== 'offense') out.push(at + 'a trade that does not raise offense');
      if (!body.startsWith('+{gain}%') || !body.includes('+{pct}% damage taken')) out.push(at + 'a trade\'s tooltip shows no gain and cost');
    } else {
      if (tip.includes('{gain}')) out.push(at + 'a gain on a Trait that is no trade');
      if (!body.startsWith((t.raises === 'defense' ? '−' : '+') + '{pct}%')) out.push(at + 'its tooltip does not open with its rank percent, signed by what it raises');
    }
    if (/[.;—–!?]/.test(tip)) out.push(at + 'a sentence, a semicolon or a dash in its tooltip');
  }
  /* GS-5 */
  const doc = d.doc;
  const rows = Object.entries(d.TRAITS);
  if (rows.length !== doc.rows.size) out.push('GS-5 ' + rows.length + ' Traits, the doc has ' + doc.rows.size);
  const byN = new Map(rows.map(([id, t]) => [t.n, id]));
  for (const [n, r] of doc.rows) {
    const id = byN.get(n), t = id && d.TRAITS[id];
    if (!t) out.push('GS-5 the doc\'s #' + n + ' ' + r.name + ' has no row');
    else if (t.name !== r.name || t.slot !== r.slot || t.source !== r.source) out.push('GS-5 #' + n + ' differs from the doc (name, slot or ground)');
  }
  for (const s of Object.keys(G.traitSlots)) {
    const of = rows.filter(([, t]) => t.slot === s);
    const pairs = [...new Set(of.map(([, t]) => t.source))].flatMap((src) => d.veryRarePairs(d.TRAITS, G.veryRareBanned || [], src, s));
    if (of.length < 2 || new Set(of.map(([, t]) => t.key)).size < 2 || !pairs.length) out.push('GS-5 slot ' + s + ' cannot roll a Very Rare (no allowed pair of 2 keys)');
  }
  for (const g of doc.similar) {
    const keys = new Set(g.map((n) => (d.TRAITS[byN.get(n)] || {}).key));
    if (keys.size !== 1) out.push('GS-5 the similar group #' + g.join(' #') + ' does not share one stacking key');
  }
  const pools = new Set(rows.map(([, t]) => t.source));
  for (const src of pools) {
    const pool = d.traitPool(src);
    if (new Set(pool.map((id) => d.TRAITS[id].best.seat)).size < 2) out.push('GS-5 ' + src + '\'s pool serves one seat');
    for (const s of Object.keys(G.traitSlots)) {
      for (const [a, b] of d.veryRarePairs(d.TRAITS, G.veryRareBanned || [], src, s)) {
        if (d.TRAITS[a].key === d.TRAITS[b].key || a === b) out.push('GS-5 a Very Rare pair of one key: ' + a + ' + ' + b);
        if (d.TRAITS[a].slot !== s || d.TRAITS[b].slot !== s) out.push('GS-5 a Very Rare pair off its slot: ' + a + ' + ' + b);
      }
    }
  }
  for (const [gid, g] of Object.entries(d.DANGER_GROUNDS)) {
    if (!Number.isInteger(g.gearLevel) || g.gearLevel <= 0 || g.gearLevel % G.tierSteps) out.push('GS-5 ' + gid + ' gearLevel is not a whole tier');
    const pool = Object.keys(d.TRAITS).filter((id) => d.TRAITS[id].source === gid);
    if (JSON.stringify([...(g.traits || [])].sort()) !== JSON.stringify(pool.sort())) out.push('GS-5 ' + gid + ' traits are not its pool');
  }
  /* GS-6 */
  const strip = (s) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [rel, text] of d.files) {
    const code = strip(text);
    for (const [file, allowed] of Object.entries(IMPORTERS)) {
      if (rel === 'src/data/' + file) continue;
      if (new RegExp('[/\'"]' + file.replace('.', '\\.')).test(code) && !allowed.has(rel)) out.push('GS-6 ' + rel + ' imports ' + file);
    }
    if (HOMES.has(rel)) continue;
    for (const [id, t] of Object.entries(d.TRAITS)) {
      if (new RegExp('[\'"`]' + id + '[\'"`]').test(text) || text.includes(t.name)) out.push('GS-6 ' + rel + ' names the hidden Trait ' + id);
    }
  }
  return out;
}

const real = () => ({ GEAR_STEPS, TRAITS, tierLevel, traitPool, veryRarePairs, DANGER, DANGER_GROUNDS, DEPTHS, GROUND_PACKS,
  EQUIP_SLOTS, METRICS, OPERATORS, EFFECT_IDS, HUNT_ROLES, ITEMS, files: srcFiles(),
  doc: readDoc(readFileSync(join(ROOT, 'docs', 'design', 'redesign', '14-trait-candidates.md'), 'utf8')) });
/* a copy whose pool readers read the copy's rows */
const copy = (d) => {
  const c = { ...d, GEAR_STEPS: structuredClone(d.GEAR_STEPS), TRAITS: structuredClone(d.TRAITS), DANGER_GROUNDS: structuredClone(d.DANGER_GROUNDS), files: new Map(d.files),
    doc: { rows: new Map(d.doc.rows), similar: d.doc.similar.map((g) => [...g]) } };
  c.traitPool = (src) => Object.keys(c.TRAITS).filter((id) => c.TRAITS[id].source === src);
  c.veryRarePairs = d.veryRarePairs;
  return c;
};

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
  ['GS-3 a Very Rare with three Traits', (d) => { d.GEAR_STEPS.traitsByRarity.very_rare = 3; }],
  ['GS-3 a trade whose net is over a rank', (d) => { d.GEAR_STEPS.tradeSteps = [7, 13, 21]; }],
  ['GS-3 a trade under its cost', (d) => { d.GEAR_STEPS.tradeSteps = [3, 13, 18]; }],
  ['GS-3 a shown percent off its steps', (d) => { d.GEAR_STEPS.shownPct.rank = [1.5, 3, 3.5]; }],
  ['GS-3 a shown trade gain off its steps', (d) => { d.GEAR_STEPS.shownPct.tradeGain = [2.5, 4.5, 7.5]; }],
  ['GS-4 a Trait on two slots', (d) => { d.TRAITS.floodmark.slot = ['boots', 'helmet']; }],
  ['GS-4 a Trait slot with no equip slot', (d) => { d.GEAR_STEPS.traitSlots.ring = ['finger']; }],
  ['GS-4 an equip slot with no Trait slot', (d) => { delete d.GEAR_STEPS.traitSlots.earrings; }],
  ['GS-4 an item\'s name', (d) => { d.TRAITS.floodmark.name = Object.values(d.ITEMS)[0].n; }],
  ['GS-4 a filler word', (d) => { d.TRAITS.floodmark.name = 'Dark Floodmark'; }],
  ['GS-4 always on', (d) => { d.TRAITS.last_file.when = { metric: 'in_fight', op: 'eq', value: true }; }],
  ['GS-4 an unknown metric', (d) => { d.TRAITS.last_file.when.metric = 'moon_is_full'; }],
  ['GS-4 a wrong operator', (d) => { d.TRAITS.captains_due.when.op = 'gte'; }],
  ['GS-4 a value outside the picker', (d) => { d.TRAITS.last_file.when.value = 140; }],
  ['GS-4 a subject the metric lacks', (d) => { d.TRAITS.floodmark.when.subject = 'everyone'; }],
  ['GS-4 an effect that is no status', (d) => { d.TRAITS.worrier.when.value = 'burning'; }],
  ['GS-4 a source that is nowhere', (d) => { d.TRAITS.file_breaker.source = 'the_moon'; d.TRAITS.file_breaker.best.ground = 'the_moon'; }],
  ['GS-4 sized on another ground', (d) => { d.TRAITS.file_breaker.best.ground = 'catacomb_bone_wing'; }],
  ['GS-4 a seat that is no seat', (d) => { d.TRAITS.keepers_carry.best.seat = 'bard'; }],
  ['GS-4 raises nothing known', (d) => { d.TRAITS.keepers_carry.raises = 'luck'; }],
  ['GS-4 a move that is no move', (d) => { d.TRAITS.full_wick.move = 'dance'; }],
  ['GS-4 a tooltip with no percent', (d) => { d.TRAITS.keepers_carry.tip = 'More healing'; }],
  ['GS-4 a defense tooltip signed up', (d) => { d.TRAITS.last_file.tip = '+{pct}% damage taken below 40% health'; }],
  ['GS-4 a party Trait without Party', (d) => { d.TRAITS.raised_colors.tip = '+{pct}% damage vs bosses'; }],
  ['GS-4 Party on a self Trait', (d) => { d.TRAITS.captains_due.tip = 'Party: +{pct}% damage vs bosses'; }],
  ['GS-4 a sentence in a tooltip', (d) => { d.TRAITS.captains_due.tip = '+{pct}% damage vs bosses. Hits hard.'; }],
  ['GS-4 a trade with no cost shown', (d) => { d.TRAITS.hasks_bargain.tip = '+{gain}% damage above 90% health'; }],
  ['GS-4 a trade on defense', (d) => { d.TRAITS.hasks_bargain.raises = 'defense'; }],
  ['GS-4 a gain on a plain Trait', (d) => { d.TRAITS.captains_due.tip = '+{gain}% damage vs bosses'; }],
  ['GS-4 running low with no start floor', (d) => { delete d.TRAITS.bottom_of_the_quiver.startMin; }],
  ['GS-4 a start floor under twice', (d) => { d.TRAITS.bottom_of_the_quiver.startMin.value = 60; }],
  ['GS-5 a Trait the doc lacks', (d) => { d.TRAITS.extra = { ...structuredClone(d.TRAITS.floodmark), n: 41, name: 'Extra Mark' }; }],
  ['GS-5 a row renamed off the doc', (d) => { d.TRAITS.worrier.name = 'Hound Tooth'; }],
  ['GS-5 a row moved off its doc ground', (d) => { d.TRAITS.worrier.source = 'ox_road'; d.TRAITS.worrier.best.ground = 'ox_road'; }],
  ['GS-5 a slot that cannot roll a Very Rare', (d) => { d.GEAR_STEPS.traitSlots.offhand = ['weapon']; }],
  ['GS-5 a similar pair on two keys', (d) => { d.TRAITS.stair_bearer.key = 'tank_save'; }],
  ['GS-5 a pool of one seat', (d) => { for (const id of d.traitPool('wyvern_roost')) d.TRAITS[id].best.seat = 'ranger'; }],
  ['GS-5 a pair roller that pairs one key', (d) => { d.veryRarePairs = (tr, b, src, s) => (s === 'cape' ? [['captains_due', 'raised_colors']] : []); }],
  ['GS-5 a slot whose only pairs are banned', (d) => { d.GEAR_STEPS.veryRareBanned = ['banded_oath+bottom_of_the_quiver', 'banded_oath+full_cellar', 'banded_oath+hasks_bargain', 'banded_oath+lookouts_promise', 'bottom_of_the_quiver+full_cellar', 'bottom_of_the_quiver+hasks_bargain', 'bottom_of_the_quiver+lookouts_promise', 'full_cellar+hasks_bargain', 'full_cellar+lookouts_promise', 'hasks_bargain+lookouts_promise']; }],
  ['GS-5 a ground off the tier', (d) => { d.DANGER_GROUNDS.muster_barrows.gearLevel += 5; }],
  ['GS-5 a pool that drops a Trait', (d) => { d.DANGER_GROUNDS.muster_barrows.traits = ['file_breaker']; }],
  ['GS-6 a screen imports the gear table', (d) => { d.files.set('src/shell/x.js', "import { GEAR_STEPS } from '../data/gear-steps.js';"); }],
  ['GS-6 a screen imports the Traits', (d) => { d.files.set('src/shell/y.js', "import { TRAITS } from '../data/traits.js';"); }],
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
  console.log(p.length ? p.length + ' problem(s)' : '✓ gear-steps: slots, tier, budget, the ' + Object.keys(TRAITS).length + ' Traits well-formed, pooled and hidden');
  process.exit(p.length ? 1 : 0);
}
