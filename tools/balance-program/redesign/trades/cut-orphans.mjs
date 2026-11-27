#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/redesign/trades/cut-orphans.mjs — WHAT THE BENCH CUT WOULD ORPHAN (lane/designer-kit-band1, game designer,
//   2026-11-27; docs/design/redesign/09-crafting.md sections 4.11 and 4.12).
//
// The cut (09 4.12) removes two doors: the live bench (src/data/recipes.js ARTISAN_RECIPES, every skill but the hearth's fuel runs, which
// make no item) with the step tiers' made pieces (STEP_MADE), and the gathering nodes as town work (catalogue-coherence's 'gathered').
// The farm plots, monster drops, the store, the start kit and every chest stay. An item is ORPHANED when it has a door today and none of
// the doors it keeps is left, and no job recipe (src/data/trades.js jobFaces) makes it. Read from the data, nothing typed:
//   catalogue-coherence itemSources()   every door an item has today, by label
//   ARTISAN_RECIPES / STEP_MADE         the bench's outputs (recipeOutcomes: a jewelry row's every outcome)
//   jobFaces()                          what the job list makes (its labels collide with the bench's 'made by <skill>', so read apart)
//
// THE BAND an orphan belongs to (one band is one gear tier, item Level 20 x band, 12-targets 8.3), first rule that answers:
//   1. its item Level (iL / tierSteps: 20 a band)
//   2. the metal or wood in its id or name (gear-tiers.js MATERIAL_TIERS: bronze 0, iron 1, steel 2, mithril 3, rune 4, ember 5, dawn 6)
//   3. the bench recipe's trade Level read as the new ladder's rung (band = floor((req - 1) / 10), 09 4.9: band b opens at 1 + 10 b)
// KIND: ammo, food (heals or a buff), drink (mana), jewelry, tool, armor (a cloak or a shield), weapon, material.
//
//   node tools/balance-program/redesign/trades/cut-orphans.mjs           print the table, write cut-orphans.json beside this file
//   node tools/balance-program/redesign/trades/cut-orphans.mjs --check   exit 1 if cut-orphans.json is not what it would write
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const OUT = join(HERE, 'cut-orphans.json');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

const [CC, R, SL, J, T, GS, G] = await Promise.all([imp('src/data/catalogue-coherence.js'), imp('src/data/recipes.js'), imp('src/data/slot-ladders.js'),
  imp('src/data/jewelry.js'), imp('src/data/trades.js'), imp('src/data/gear-steps.js'), imp('src/data/gathering.js')]);
const { ITEMS } = CC;
const tierSteps = GS.GEAR_STEPS.tierSteps;

/* the bench's outputs, each with the lowest trade Level that makes it */
const benchReq = new Map();
const benchOut = (id, req) => { if (id && (!benchReq.has(id) || req < benchReq.get(id))) benchReq.set(id, req); };
for (const [skill, list] of Object.entries(R.ARTISAN_RECIPES_EVERY || R.ARTISAN_RECIPES)) {
  if (skill === 'inner_flame') continue; /* the hearth's fuel runs stay (09 4.12 ruling) and make no item */
  for (const r of list) for (const id of J.recipeOutcomes(r)) benchOut(id, Number(r.req) || 1);
}
for (const list of Object.values(SL.STEP_MADE)) for (const r of list) benchOut(r.output, Number(r.req) || 1);
/* a gathered good's node Level stands in for the bench Level (rule 3) */
for (const list of [G.TREES, G.ROCKS, G.FISH_SPOTS]) for (const n of list || []) benchOut(n.prod, Number(n.req) || 1);
const jobMade = new Set(T.jobFaces().map((j) => j.output).filter(Boolean));

const sources = CC.itemSources();
const KEEPS = (label) => label !== 'gathered' && !/^made by /.test(label);

const METALS = [['bronze', 0], ['copper', 0], ['tin', 0], ['iron', 1], ['oak', 1], ['steel', 2], ['willow', 2], ['mithril', 3], ['maple', 3],
  ['rune', 4], ['yew', 4], ['ember', 5], ['dawn', 6], ['cobalt', 7], ['wolfram', 8]];
function bandOf(id, it) {
  if (Number.isInteger(it.iL)) return { band: Math.floor(it.iL / tierSteps), by: 'item Level ' + it.iL };
  /* a rune's family word is no metal: its tier is its bench Level (madeLv), read by rule 3 */
  const words = it.runeTier ? [] : (id + ' ' + (it.n || '')).toLowerCase().split(/[^a-z]+/);
  for (const [w, b] of METALS) if (words.includes(w)) return { band: b, by: 'metal ' + w };
  const req = benchReq.get(id) || 1;
  return { band: Math.max(0, Math.floor((req - 1) / 10)), by: 'bench Level ' + req };
}
function kindOf(it) {
  if (it.type === 'ammo') return 'ammo';
  if (it.type === 'jewelry') return 'jewelry';
  if (it.type === 'tool') return 'tool';
  if (it.type === 'armor' || it.type === 'offhand' || it.slot === 'cape' || it.slot === 'back') return 'armor';
  if (it.type === 'weapon') return 'weapon';
  if (Number(it.mana) > 0) return 'drink';
  if (Number(it.heals) > 0 || it.buff) return 'food';
  return 'material';
}

const orphans = [];
for (const id of Object.keys(ITEMS).sort()) {
  const labels = sources.get(id) || [];
  if (!labels.length) continue;
  if (labels.some(KEEPS) || jobMade.has(id)) continue;
  const it = ITEMS[id];
  const b = bandOf(id, it);
  orphans.push({ id, name: it.n || id, kind: kindOf(it), band: b.band, by: b.by, doors: labels.slice().sort() });
}

const byBand = {};
for (const o of orphans) ((byBand[o.band] ||= {})[o.kind] ||= []).push(o.id);
const result = { count: orphans.length, byBand, orphans };
const text = JSON.stringify(result, null, 1) + '\n';

if (process.argv.includes('--check')) {
  const have = existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\r').join('') : '';
  if (have !== text) { console.error('cut-orphans.json is stale: run node tools/balance-program/redesign/trades/cut-orphans.mjs'); process.exit(1); }
  console.log('cut-orphans: ' + orphans.length + ' orphans, the file is current');
  process.exit(0);
}
writeFileSync(OUT, text);
console.log('THE BENCH CUT ORPHANS ' + orphans.length + ' live items (no door left, no job makes them)\n');
const kinds = ['ammo', 'food', 'drink', 'jewelry', 'tool', 'armor', 'weapon', 'material'];
console.log('| Band | ' + kinds.join(' | ') + ' | All |');
console.log('|---|' + kinds.map(() => '---|').join('') + '---|');
for (const b of Object.keys(byBand).map(Number).sort((a, c) => a - c)) {
  const row = kinds.map((k) => (byBand[b][k] || []).length);
  console.log('| ' + b + ' | ' + row.join(' | ') + ' | ' + row.reduce((a, c) => a + c, 0) + ' |');
}
for (const b of Object.keys(byBand).map(Number).sort((a, c) => a - c)) {
  console.log('\nband ' + b);
  for (const k of kinds) if (byBand[b][k]) console.log('  ' + k.padEnd(9) + byBand[b][k].join(', '));
}
