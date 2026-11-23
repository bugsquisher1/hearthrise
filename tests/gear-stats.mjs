#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/gear-stats.mjs — EVERY PIECE OF GEAR IS THE ONE FORMULA'S, AND ON THE DANGER SCALE A PIECE IS ITS ITEM LEVEL AND NOTHING ELSE
// (Systems, lane/gear-catalogue-steps, 2026-11-22; src/core/gear-stats.js, src/data/gear-profiles.js, tools/gen-gear.mjs).
//
//   GSF-1 DERIVED: every gear row of the catalogue (and the hidden fist wraps and the staged special sample) carries exactly the stats the
//         formula gives its slot, item Level, profile, rarity and stated offset (gen-gear readBack), and the generated table is
//         what the generator would write.
//   GSF-2 NO STAT BY HAND: no item module types a base stat on a gear row as a number; a named piece states `statPlus`, never a raw number.
//   GSF-3 RARITY NEVER SIZES THE BASE (04-math-strategy section 10 rule 1): the same piece at every rarity has the same stats.
//   GSF-4 ON THE SCALE THE STEP CARRIES THE TIER: on a Danger-scale ground (scaleItems) every piece fights with the formula's stats at the
//         ground's base item Level moved GEAR_SCALE_STAT_PM (under 1000) of the way to its own, its own `iL` kept for the power step, a
//         named piece keeps its offset, and any other ground reads the catalogue itself.
//   GSF-5 ONE VIEW FOR EVERY READER: the edge settle, the start point's frozen peers and the browser's live view all fight through scaleItems
//         on the instance's own ground (so the three agree to the bit).
//   GSF-7 EVERY PIECE HAS AN ITEM LEVEL (the formula master's phase A, 27-formula-overhaul.md 2.3): every gear row carries a whole `iL` over 0.
//   GSF-6 THE CURVES CLIMB: within every ladder (GEAR_LADDERS) no rung's base stat is smaller in size than the rung below it.
//
//   node tests/gear-stats.mjs            the guard
//   node tests/gear-stats.mjs --mutate   each rule driven red by a defect planted on an in-memory copy
//
// mutant-anchors: none — every mutant edits an in-memory copy of the rows or the sources, never a file
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';
import * as GS from '../src/core/gear-stats.js';
import { GEAR_STAT_FIELDS, RARITY_PM, GEAR_SCALE_STAT_PM } from '../src/data/gear-profiles.js';
import { GEAR_LADDERS } from '../src/data/gear-tiers.js';
import { DANGER_GROUNDS } from '../src/data/danger.js';
import { ITEMS, SCALE_ITEM_LEVELS } from '../src/data/items.js';
import { FIST_ITEMS } from '../src/data/fists.js';
import { SPECIAL_SAMPLE } from '../src/data/special-attributes.js';
import { deriveAll, readBack, render, OUT } from '../tools/gen-gear.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* the modules that hold gear rows (GSF-2) */
const MODULES = ['src/data/items.js', 'src/data/gear-tiers.js', 'src/data/wave3-uniques.js', 'src/data/slot-ladders.js', 'src/data/champions.js',
  'src/data/boss-calls.js', 'src/data/library2-items.js', 'src/data/shields.js', 'src/data/fists.js', 'src/data/special-attributes.js'];
/* the three readers that build a hunt's members (GSF-5): each must hand memberSide the scale view of the instance's own ground */
const READERS = [
  ['supabase/functions/hr-accrue/accrue-hunt.js', 'const ctx = { items: scaleItems(inp.items || {}, inp.ground),'],
  ['supabase/functions/hr-accrue/hunt-settle.js', 'const items = scaleItems(ITEMS, (huntGroundOf(String(inst.hunt)) || {}).ground);'],
  ['src/hunt-view/live-engine.js', '{ items: scaleItems(items, where.ground) }'],
  ['src/hunt-view/live-engine.js', 'items: scaleItems(items, s.where.ground),'],
];
const statsOf = (it) => Object.fromEntries(GEAR_STAT_FIELDS.filter((k) => it && it[k]).map((k) => [k, it[k]]));
const same = (a, b) => JSON.stringify(statsOf(a)) === JSON.stringify(statsOf(b));

export function check(o) {
  const out = [];
  /* GSF-1 */
  const sample = Object.fromEntries(Object.entries(o.sample).map(([id, s]) => [id, { ...s, row: Object.fromEntries(Object.entries(s.row).filter(([k]) => !GEAR_STAT_FIELDS.includes(k))) }]));
  const all = deriveAll(o.GS, o.items, o.fists, sample, o.scale);
  for (const b of readBack(all, { GS: o.GS, ITEMS: o.items, SPECIAL_SAMPLE: o.sample, GEAR_STAT_FIELDS })) out.push('GSF-1 ' + b);
  if (o.table !== render(all)) out.push('GSF-1 src/data/gear-stats.generated.js is not what tools/gen-gear.mjs writes');
  /* GSF-2: a gear row's line (it names a slot) carries no `stat: number` outside its statPlus (ammo is a supply, sized by hand) */
  const STAT = new RegExp('\\b(' + GEAR_STAT_FIELDS.join('|') + ')\\s*:\\s*-?[\\d.]+');
  for (const [file, text] of Object.entries(o.sources)) {
    text.split('\n').forEach((line, i) => {
      if (!/\bslot\s*:/.test(line) || /ammo/.test(line)) return;
      const bare = line.replace(/statPlus\s*:\s*(Object\.freeze\()?\{[^}]*\}\)?/g, '');
      if (STAT.test(bare)) out.push('GSF-2 ' + file + ':' + (i + 1) + ' types ' + bare.match(STAT)[0] + ' by hand');
    });
  }
  /* GSF-3 */
  for (const profile of ['sword', 'plate', 'leather', 'jewel']) {
    const at = (rarity) => JSON.stringify(o.GS.gearStats({ slot: profile === 'jewel' ? 'ring' : profile === 'sword' ? 'weapon' : 'body', iL: 60, profile, rarity }));
    const one = at('common');
    for (const r of Object.keys(RARITY_PM)) if (at(r) !== one) out.push('GSF-3 a ' + r + ' ' + profile + ' piece is sized unlike a common one');
  }
  /* GSF-4 */
  const scaleGround = Object.keys(DANGER_GROUNDS)[0], gl = DANGER_GROUNDS[scaleGround].gearLevel;
  if (!(o.scalePm >= 0 && o.scalePm < 1000)) out.push('GSF-4 GEAR_SCALE_STAT_PM ' + o.scalePm + ': the stats would carry the whole tier on top of the power step');
  const view = o.scaleItems(o.items, { id: scaleGround });
  if (o.scaleItems(o.items, { id: 'no_such_ground' }) !== o.items) out.push('GSF-4 a ground off the scale does not read the catalogue itself');
  if (view === o.items) out.push('GSF-4 ' + scaleGround + ' fights the catalogue as written');
  else {
    for (const l of GEAR_LADDERS) {
      const ids = l.ids.filter((id) => id && view[id]);
      for (const id of ids) {
        const want = o.GS.statsOfRow(o.items[id], o.GS.scaleStatLevel(gl, o.GS.baseOf(o.items[id], undefined, o.items).iL), o.items);
        if (!same(view[id], want)) { out.push('GSF-4 on ' + scaleGround + ' ' + id + ' fights ' + JSON.stringify(statsOf(view[id])) + ', not the formula at its scale Level ' + JSON.stringify(want)); break; }
      }
      for (const id of ids) if (o.items[id].iL !== view[id].iL) out.push('GSF-4 ' + id + ' lost its item Level on the scale');
    }
    const named = Object.keys(o.items).find((id) => o.items[id] && o.items[id].statPlus && o.items[id].statPlus.critB > 0 && o.items[id].slot === 'weapon');
    if (named && !(view[named].critB >= o.items[named].statPlus.critB)) out.push('GSF-4 ' + named + ' lost its stated offset on the scale');
  }
  /* GSF-5 */
  for (const [file, needle] of READERS) if (!o.readers[file] || !o.readers[file].includes(needle)) out.push('GSF-5 ' + file + ' builds a hunt\'s heroes without the scale view (' + needle + ')');
  /* GSF-7 */
  for (const [id, it] of Object.entries(o.items)) if (o.GS.isGearRow(it) && !(Number.isInteger(it.iL) && it.iL > 0)) out.push('GSF-7 ' + id + ' carries no item Level');
  /* GSF-6 */
  for (const l of GEAR_LADDERS) {
    const rows = l.ids.filter((id) => id && o.items[id]).map((id) => [id, o.items[id]]);
    for (let i = 1; i < rows.length; i++) for (const k of GEAR_STAT_FIELDS) {
      if (Math.abs(rows[i][1][k] || 0) < Math.abs(rows[i - 1][1][k] || 0)) out.push('GSF-6 ' + rows[i][0] + '.' + k + ' ' + (rows[i][1][k] || 0) + ' under ' + rows[i - 1][0] + '\'s ' + (rows[i - 1][1][k] || 0));
    }
  }
  return out;
}

function live() {
  const sources = Object.fromEntries(MODULES.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
  const readers = Object.fromEntries([...new Set(READERS.map(([f]) => f))].map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
  return { GS, items: ITEMS, fists: FIST_ITEMS, sample: SPECIAL_SAMPLE, table: readFileSync(OUT, 'utf8').replace(/\r/g, ''), sources, readers, scaleItems: GS.scaleItems, scalePm: GEAR_SCALE_STAT_PM, scale: SCALE_ITEM_LEVELS };
}

const MUTANTS = [
  ['GSF-1', 'a ladder piece keeps an armor point by hand', (o) => { o.items = { ...o.items, rune_platebody: { ...o.items.rune_platebody, defB: o.items.rune_platebody.defB + 1 } }; }],
  ['GSF-1', 'the generated table drifts from the formula', (o) => { o.table = o.table.replace('"dawn_sword": f({', '"dawn_sword": f({ atkB: 1 }), "dawn_sword~planted": f({'); }],
  ['GSF-2', 'a named row types its damage', (o) => { o.sources['src/data/wave3-uniques.js'] = o.sources['src/data/wave3-uniques.js'].replace("weaponType:'sword',statPlus:", "weaponType:'sword',strB:9,statPlus:"); }],
  ['GSF-3', 'a Rare piece is bigger', (o) => { const g = o.GS; o.GS = { ...g, gearStats: (b) => { const s = g.gearStats(b); return b.rarity === 'rare' ? { ...s, defB: (s.defB || 0) + 1 } : s; } }; }],
  ['GSF-4', 'the scale view is the catalogue', (o) => { o.scaleItems = (items) => items; }],
  ['GSF-4', 'the stats carry the whole tier on the scale', (o) => { o.scalePm = 1000; }],
  ['GSF-4', 'the scale view sizes every piece at the base alone', (o) => {
    const g = o.GS;
    o.scaleItems = (items, gr) => {
      const L = DANGER_GROUNDS[gr.id] && DANGER_GROUNDS[gr.id].gearLevel;
      if (!L) return items;
      const v = {};
      for (const [k, it] of Object.entries(items)) {
        const st = g.isGearRow(it) && g.profileKeyOf(it) ? g.statsOfRow(it, L, items) : null;
        v[k] = st ? { ...Object.fromEntries(Object.entries(it).filter(([x]) => !GEAR_STAT_FIELDS.includes(x))), ...st } : it;
      }
      return v;
    };
  }],
  ['GSF-4', 'the scale view drops the item Level', (o) => { const f = o.scaleItems; o.scaleItems = (items, g) => { const v = f(items, g); if (v === items) return v; const w = {}; for (const [k, it] of Object.entries(v)) { const { iL, ...r } = it; void iL; w[k] = r; } return w; }; }],
  ['GSF-5', 'the edge settle fights the catalogue as written', (o) => { const f = 'supabase/functions/hr-accrue/accrue-hunt.js'; o.readers[f] = o.readers[f].replace('items: scaleItems(inp.items || {}, inp.ground)', 'items: inp.items || {}'); }],
  ['GSF-5', 'the browser fights the catalogue as written', (o) => { const f = 'src/hunt-view/live-engine.js'; o.readers[f] = o.readers[f].replace('{ items: scaleItems(items, where.ground) }', '{ items }'); }],
  ['GSF-7', 'a piece with no item Level', (o) => { const { iL, ...r } = o.items.rune_sword; void iL; o.items = { ...o.items, rune_sword: r }; }],
  ['GSF-6', 'a rung steps down', (o) => { o.items = { ...o.items, rune_sword: { ...o.items.rune_sword, atkB: 1 } }; }],
];

if (isMain(import.meta.url)) {
  if (process.argv.includes('--mutate')) {
    let bad = 0;
    for (const [rule, name, plant] of MUTANTS) {
      const o = live();
      o.sources = { ...o.sources }; o.readers = { ...o.readers };
      plant(o);
      const hit = check(o).some((l) => l.startsWith(rule + ' '));
      console.log((hit ? 'caught  ' : 'MISSED  ') + rule + ' ' + name);
      if (!hit) bad++;
    }
    console.log(bad ? 'gear-stats --mutate: ' + bad + ' mutant(s) survived' : 'gear-stats --mutate: ' + MUTANTS.length + ' of ' + MUTANTS.length + ' caught');
    process.exit(bad ? 1 : 0);
  }
  const out = check(live());
  if (out.length) { console.error('gear-stats: RED\n  ' + out.slice(0, 40).join('\n  ')); process.exit(1); }
  console.log('gear-stats: every piece is the formula\'s, no stat by hand, rarity never sizes the base, on the scale the step carries the tier (one view for every reader), every ladder climbs');
}
