#!/usr/bin/env node
// tools/balance-sim/armor-line-table.mjs — ARMOR PAST DAWNSTEEL, measured on the real engine (designer,
// lane/d-armor-past-dawnsteel; the design is docs/planning/PRIORITY_BOARD.md "2026-11-15 Armor past Dawnsteel").
// A what-if tool: it writes nothing to src/. The line and its sample of five live in tools/balance-sim/staged/armor-line.js, which no
// catalogue imports; this tool adds rows to the engine's ITEMS in memory (both instances the fight can read), dresses each
// seat in them through the kit picker's `also`, and plays the same dice for every variant.
//
//   node tools/balance-sim/armor-line-table.mjs curve                          the line by band: a full set's armor and what it does
//                                                                              against a monster of its Level, beside Dawnsteel's (no fights)
//   node tools/balance-sim/armor-line-table.mjs catacombs [--seeds 3] [--hours 2] the Unmarked Catacombs at its floor (165): today's kit, full
//                                                                              Dawnsteel, the line one band behind and on it, the sample,
//                                                                              each on the ground's guide food and on Salted Shark
//   node tools/balance-sim/armor-line-table.mjs roost  [--seeds 4] [--hours 2] Wyvern Roost's Deadly on the full box (8, the pack's
//                                                                              override brings 6): Dawnsteel against the line, two foods
//   catacombs and roost take --only <variant rows> and --food <food row> (0-based) to split one table over processes
//
// Every variant keeps the hero's weapon from the gear ladder. The tank's shield is the ladder's (the Coppercap, guard 7: main's shield
// ladder stops at tier 3) where the variant says so, else Krell's Tollgate (guard 15, src/data/special-attributes.js, the tier-7 rung):
// a shield's guard is a flat 2% off every monster's to-hit at any Level, so the two are read apart from the armor.
// The Limewashed Leg Plates' 3% physical resistance has no engine hook yet (special-attributes.js HOOK 1), so the sample is
// measured without it: the sample reads at most what it gives.
// Exit 0 when every cell ran; 1 otherwise.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceQuery } from '../lib/version-stamp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const mode = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const SLOTS = ['helmet', 'body', 'pants', 'boots', 'gloves', 'belt'];
const LINE_OF = { tank: 'plate', sword: 'plate', hammer: 'plate', axes: 'plate', bow: 'leather', crossbow: 'leather', mage: 'cloth', healer: 'cloth' };
const head = (title, cols) => { console.log('\n' + title); console.log('| ' + cols.join(' | ') + ' |'); console.log('|' + cols.map(() => '---').join('|') + '|'); };
const line = (cells) => console.log('| ' + cells.join(' | ') + ' |');

/* ── THE LINE BY BAND (no fights): mitigation.js against a monster of the band's Level + 5, the Catacombs' and the Roost's own spread ── */
async function curve() {
  const AL = await import(u('tools/balance-sim/staged/armor-line.js'));
  const MIT = await import(u('src/core/mitigation.js'));
  const set = (cls, scale) => SLOTS.reduce((s, k) => s + Math.round(AL.LINE_BASE[cls].defB[k] * scale), 0);
  const at = (cls, P, L) => { const v = { heavy: 0, medium: 0, light: 0 }; v[{ plate: 'heavy', leather: 'medium', cloth: 'light' }[cls]] = P; const m = MIT.mitigationOf(v, L); return cls === 'plate' ? m.absorbPm / 10 + '%' : cls === 'leather' ? m.dodgePm / 10 + '%' : m.ward + ' off a blow'; };
  head('THE ARMOR LINE: a full set worn from Level R carries Dawnsteel x max(1, R / ' + AL.LINE_ANCHOR_LEVEL + '). What it does against a monster of Level R + 5, and what full Dawnsteel does there',
    ['Worn from', 'Where', 'x', 'Plate set', 'absorbs', 'Dawnsteel absorbs', 'Leather set', 'dodges', 'Dawnhide dodges', 'Cloth set', 'wards', 'Duskweave wards']);
  for (const b of AL.LINE_BANDS) {
    const s = AL.lineScale(b.reqLv), L = b.reqLv + 5;
    const row = [b.reqLv, b.where, s.toFixed(2)];
    for (const cls of ['plate', 'leather', 'cloth']) row.push(set(cls, s), at(cls, set(cls, s), L), at(cls, set(cls, 1), L));
    line(row);
  }
}

/* The engine with extra rows in both ITEMS instances, and a cell runner on it. */
async function engine(extra) {
  const { loadCellRunner } = await import(u('tools/balance-sim/cell.mjs'));
  const R = await loadCellRunner(ROOT);
  const { BUILD } = await import(u('src/build-info.js'));
  const tables = [(await import(u('src/data/items.js') + sourceQuery(ROOT))).ITEMS, (await import(u('src/data/items.js'))).ITEMS];
  for (const t of new Set(tables)) for (const [id, row] of Object.entries(extra)) { if (t[id]) throw new Error('armor-line-table: ' + id + ' is already an item'); t[id] = JSON.parse(JSON.stringify(row)); }
  return R;
}

/* In-memory rows: the Dawnsteel set at x`m` per weight ('line_<m>_<weight>_<slot>'), the sample, and the Tollgate. */
async function rowsFor(scales) {
  const AL = await import(u('tools/balance-sim/staged/armor-line.js'));
  const { SPECIAL_SAMPLE } = await import(u('src/data/special-attributes.js'));
  const { ITEMS } = await import(u('src/data/items.js'));
  const out = { sample_krells_tollgate: SPECIAL_SAMPLE.krells_tollgate.row };
  for (const m of scales) for (const cls of ['plate', 'leather', 'cloth']) for (const k of SLOTS) {
    const base = ITEMS[AL.LINE_BASE[cls].ids[k]];
    out['line_' + m + '_' + cls + '_' + k] = { ...base, defB: Math.round(base.defB * m), n: 'what-if' };
  }
  for (const [id, s] of Object.entries(AL.LINE_SAMPLE)) out['sample_' + id] = s.row;
  return { rows: out, AL };
}

/* What each seat wears in a variant, on top of the ladder kit: { slot: id }. */
function wearOf(variant, style, AL) {
  const cls = LINE_OF[style], w = {};
  if (variant.kind === 'ladder') return w;
  if (style === 'tank' && variant.shield !== 'ladder') w.shield = 'sample_krells_tollgate';
  for (const k of SLOTS) w[k] = variant.kind === 'line' ? 'line_' + variant.m + '_' + cls + '_' + k : AL.LINE_BASE[cls].ids[k];
  /* the sample's pieces of the seat's weight, the latest Level last so it wins its slot (the Catacombs' 165 over the Roost's 125) */
  if (variant.kind === 'sample') for (const [id, s] of Object.entries(AL.LINE_SAMPLE).sort((a, b) => a[1].row.reqLv - b[1].row.reqLv)) if (s.row.armourClass === cls) w[s.row.slot] = 'sample_' + id;
  return w;
}

/* One cell's numbers: deaths per 16 hero-hours, and each hero's typical low (the median encounter's lowest HP %), food eaten an hour, Level XP an hour. */
function read(res) {
  const hh = res.heroes.reduce((s, h) => s + h.hours, 0), d = res.heroes.reduce((s, h) => s + h.deaths, 0);
  return { per16: Math.round((160 * d) / Math.max(hh, 1e-9)) / 10,
    heroes: res.heroes.map((h) => ({ style: h.style, low: Math.round(h.encMinHpPct.p50), food: Math.round((h.eatsPerH.own || 0) + (h.eatsPerH.store || 0)), xp: Math.round(h.levelXpPerH / 1000), mit: h.mit })) };
}
const mitWord = (m) => (m.absorbPm ? 'absorb ' + m.absorbPm / 10 + '%' : m.dodgePm ? 'dodge ' + m.dodgePm / 10 + '%' : 'ward ' + m.ward);

async function playGround(spec) {
  const SEEDS = Number(arg('seeds', spec.seeds)), HOURS = Number(arg('hours', spec.hours));
  const { rows, AL } = await rowsFor(spec.variants.filter((v) => v.kind === 'line').map((v) => v.m));
  const R = await engine(rows);
  const T = await import(u('tools/balance-program/tier-axis.mjs'));
  head(spec.title + ' ' + SEEDS + ' seeds x ' + HOURS + ' h a cell, the same dice in every variant. Deaths are per 16 hero-hours (the sheet: a Deadly four at most 9); "low" is the typical low point (the sheet: Normal at least 60%).',
    ['Kit', 'Food', ...spec.cells.map((c) => c.label)]);
  /* --only 0,2 plays those variants (by row), --food 1 that food (by row): one table split over processes, the same dice */
  const only = arg('only', null) ? arg('only', '').split(',').map(Number) : null, foodOnly = arg('food', null) === null ? null : Number(arg('food'));
  for (const [fi, food] of spec.foods.entries()) for (const [vi, v] of spec.variants.entries()) {
    if ((only && !only.includes(vi)) || (foodOnly !== null && foodOnly !== fi)) continue;
    const out = [v.label, food.label];
    for (const c of spec.cells) {
      const cell = { id: spec.ground + ':' + c.party.join('+') + ':' + v.label + ':' + food.id, ground: spec.ground, party: c.party, level: spec.level, hours: HOURS, seeds: SEEDS,
        gearBySeat: c.party.map((s) => ({ openAlso: spec.openAlso, also: wearOf(v, s, AL) })), ...(c.tier !== 'normal' ? { options: { tier: c.tier } } : {}),
        ...(c.tier !== 'normal' ? { density: c.pull || T.tierRowOf(spec.ground, c.tier).pull[c.party.length - 1] } : {}), ...(food.id ? { bar: { storeFood: food.id } } : {}) };
      const r = read(R.runCell(cell));
      out.push(c.show === 'deaths' ? r.per16 + ' (tank low ' + r.heroes[0].low + '%)' : r.heroes[0].low + '% (' + mitWord(r.heroes[0].mit) + ', food ' + r.heroes[0].food + '/h)');
    }
    line(out);
  }
}

const VARIANTS_165 = [
  { kind: 'ladder', label: 'Today\'s ladder kit (Emberforged helm and body, Coppercap Shield)' },
  { kind: 'dawn', shield: 'ladder', label: 'Full Dawnsteel, Coppercap Shield' },
  { kind: 'dawn', label: 'Full Dawnsteel, the Tollgate' },
  { kind: 'line', m: 1.27, label: 'The line one band behind (x1.27, worn from 140)' },
  { kind: 'line', m: 1.5, label: 'The line (x1.5, worn from 165)' },
  { kind: 'sample', label: 'The sample: its 3 heavy pieces or its body, Dawnsteel elsewhere' },
];
async function catacombs() {
  await playGround({ ground: 'unmarked_catacombs', level: 165, seeds: 3, hours: 2, openAlso: ['unmarked_catacombs', 'carters_rest', 'ox_road', 'wyvern_roost'],
    title: 'THE UNMARKED CATACOMBS AT ITS FLOOR, Level 165, the Morrow\'s three packs open on the ladder.',
    foods: [{ id: null, label: 'the guide\'s (Salted Lobster)' }, { id: 'salted_shark', label: 'Salted Shark' }], variants: VARIANTS_165,
    cells: [{ label: 'Normal, tank alone', party: ['tank'], tier: 'normal' }, { label: 'Normal, hammer alone', party: ['hammer'], tier: 'normal' },
      { label: 'Normal, bow alone', party: ['bow'], tier: 'normal' }, { label: 'Normal, Mage alone', party: ['mage'], tier: 'normal' },
      { label: 'Dangerous, tank and Healer', party: ['tank', 'healer'], tier: 'dangerous', show: 'deaths' },
      { label: 'Deadly, a four', party: ['tank', 'healer', 'bow', 'mage'], tier: 'deadly', show: 'deaths' }] });
}
async function roost() {
  await playGround({ ground: 'wyvern_roost', level: 125, seeds: 4, hours: 2, openAlso: ['wyvern_roost', 'carters_rest', 'ox_road'],
    title: 'WYVERN ROOST\'S DEADLY ON THE FULL BOX (8; the pack\'s tierOverride brings 6), Level 125.',
    foods: [{ id: null, label: 'the guide\'s (Salted Lobster)' }, { id: 'salted_swordfish', label: 'Salted Swordfish' }],
    variants: [{ kind: 'dawn', shield: 'ladder', label: 'Full Dawnsteel, Coppercap Shield' }, { kind: 'dawn', label: 'Full Dawnsteel, the Tollgate' }, { kind: 'line', m: 1.14, label: 'The line (x1.14, worn from 125)' }],
    cells: [{ label: 'Deadly on 8, a four', party: ['tank', 'healer', 'bow', 'mage'], tier: 'deadly', pull: 8, show: 'deaths' }] });
}

const MODES = { curve, catacombs, roost };
if (!MODES[mode]) { console.error('usage: node tools/balance-sim/armor-line-table.mjs ' + Object.keys(MODES).join('|') + ' [--seeds N] [--hours N]'); process.exit(1); }
const t0 = Date.now();
try { await MODES[mode](); } catch (e) { console.error('armor-line-table: ' + (e && e.stack || e)); process.exit(1); }
console.log('\n(' + mode + ': ' + Math.round((Date.now() - t0) / 1000) + ' s)');
