#!/usr/bin/env node
// tools/balance-program/items/drops-table.mjs: WHERE EVERY DROPPED THING COMES FROM AND GOES (balance program dive 23).
// A measuring tool: it reads the game's own data rows and prints. It writes nothing and grades nothing. READ FROM DATA, no play.
//
//   node tools/balance-program/items/drops-table.mjs inputs    every recipe input that is a monster drop: the open grounds that drop
//                                                              it (monster, chance a kill, band), or NO OPEN SOURCE
//   node tools/balance-program/items/drops-table.mjs grounds   a row an open ground: its drop rows by band, its gear rows by tier,
//                                                              and the Shop's bid on one of each gear row
//   node tools/balance-program/items/drops-table.mjs orphans   drop rows that sit only on monsters no open ground places
//   node tools/balance-program/items/drops-table.mjs sinks     every dropped item on an open ground and what uses it (a recipe, a
//                                                              Tempering rung, a fuel, a pattern, a gem job), or SHOP ONLY
// Exit 0 when it ran, 2 on a bad argument.
import { ITEMS } from '../../../src/data/items.js';
import { MONSTERS } from '../../../src/data/monsters.js';
import { OPEN_GROUNDS, OPEN_HALL_GROUNDS, HUNT_GROUNDS, HALL_GROUNDS } from '../../../src/data/hunt-grounds.js';
import { ARTISAN_RECIPES_EVERY } from '../../../src/data/recipes.js';
import { recipeInputs } from '../../../src/core/artisan.js';
import { TEMPER_MATERIALS } from '../../../src/data/temper.js';
import { TREES, ROCKS, FISH_SPOTS, CROPS } from '../../../src/data/gathering.js';
import { vendorPriceOf } from '../../../supabase/functions/hr-accrue/catalogue.js';

const mode = process.argv[2] || 'inputs';
const placed = (g) => [...new Set((g.pockets || []).flatMap((p) => [...(p.pack || []), ...(p.spawns || []), ...(p.adds || [])].map((s) => s.monster)))];
const OPEN = { ...OPEN_GROUNDS, ...OPEN_HALL_GROUNDS };
const EVERY = { ...HUNT_GROUNDS, ...HALL_GROUNDS };
const GEAR = ['weapon', 'armor', 'offhand', 'jewelry'];
const nameOf = (id) => (ITEMS[id] && ITEMS[id].n) || id;
const bid = (id) => vendorPriceOf(ITEMS, id);
/* item -> [{ground, monster, ch, band}] on open grounds */
const SRC = {};
const openMonsters = new Set();
for (const [gid, g] of Object.entries(OPEN)) for (const m of placed(g)) {
  openMonsters.add(m);
  for (const d of (MONSTERS[m] && MONSTERS[m].drops) || []) if (d && d.id) (SRC[d.id] = SRC[d.id] || []).push({ ground: gid, monster: m, ch: d.ch, band: d.band || '?' });
}
const USES = {};
for (const [skill, list] of Object.entries(ARTISAN_RECIPES_EVERY)) for (const r of list) for (const id of Object.keys(recipeInputs(r))) (USES[id] = USES[id] || []).push(skill + ':' + r.id);
const temperText = JSON.stringify(TEMPER_MATERIALS);

if (mode === 'inputs') {
  console.log('input | recipes that take it | open sources (ground: monster chance band)');
  for (const [id, rs] of Object.entries(USES).sort()) {
    const it = ITEMS[id];
    if (!it) { console.log([id, rs.length, 'NO ITEM ROW'].join(' | ')); continue; }
    const s = SRC[id];
    if (!s) continue;   // not a drop on an open ground: gathered, farmed or made (or orphaned: see below)
    console.log([nameOf(id), rs.length, s.map((x) => x.ground + ': ' + x.monster + ' ' + (x.ch * 100).toFixed(2) + '% ' + x.band).join('; ')].join(' | '));
  }
  console.log('\nInputs with NO open source of any kind (not gathered, farmed, made, sold or dropped on an open ground):');
  const produced = new Set();
  const grown = new Set([...TREES, ...ROCKS, ...FISH_SPOTS].map((n) => n.prod).concat(Object.values(CROPS).map((c) => c.prod)));
  for (const list of Object.values(ARTISAN_RECIPES_EVERY)) for (const r of list) if (r.output) produced.add(r.output);
  for (const [id, rs] of Object.entries(USES).sort()) {
    const it = ITEMS[id] || {};
    if (SRC[id] || produced.has(id) || grown.has(id)) continue;
    console.log('  ' + nameOf(id) + ' (' + id + '): ' + rs.join(', '));
  }
} else if (mode === 'grounds') {
  console.log('ground | monsters | rows common/uncommon/scarce/rare/key/trophy | gear rows by tier | junk rows (no use) | material rows');
  for (const [gid, g] of Object.entries(OPEN)) {
    const bands = { common: 0, uncommon: 0, scarce: 0, rare: 0, key: 0, trophy: 0 }; const tiers = {}; let junk = 0, mat = 0;
    const seen = new Set();
    for (const m of placed(g)) for (const d of (MONSTERS[m] && MONSTERS[m].drops) || []) {
      if (!d || !d.id) continue;
      bands[d.band] = (bands[d.band] || 0) + 1;
      const it = ITEMS[d.id] || {};
      if (GEAR.includes(it.type)) tiers[it.tier || 1] = (tiers[it.tier || 1] || 0) + 1;
      else if (!seen.has(d.id)) { seen.add(d.id); if (USES[d.id] || temperText.includes('"' + d.id + '"')) mat++; else junk++; }
    }
    console.log([gid, placed(g).length, Object.values(bands).join('/'), Object.entries(tiers).map(([t, n]) => 'T' + t + ' x' + n).join(' '), junk, mat].join(' | '));
  }
} else if (mode === 'orphans') {
  const only = {};
  for (const [m, row] of Object.entries(MONSTERS)) {
    if (openMonsters.has(m)) continue;
    const staged = Object.entries(EVERY).some(([, g]) => placed(g).includes(m));
    for (const d of row.drops || []) if (d && d.id && !SRC[d.id]) (only[d.id] = only[d.id] || []).push(m + (staged ? ' (staged ground)' : ' (no ground)'));
  }
  const rows = Object.entries(only).sort();
  console.log('item | type | used by a recipe | only dropped by');
  for (const [id, ms] of rows) console.log([nameOf(id), (ITEMS[id] || {}).type || '-', USES[id] ? USES[id].length : 0, ms.slice(0, 4).join(', ') + (ms.length > 4 ? ' +' + (ms.length - 4) : '')].join(' | '));
  console.log(rows.length + ' items drop only from monsters no open ground places; ' + rows.filter(([id]) => USES[id]).length + ' of them are a recipe input.');
  console.log(Object.keys(MONSTERS).length + ' monster rows, ' + openMonsters.size + ' placed on an open ground.');
} else if (mode === 'sinks') {
  let n = 0, shop = 0;
  console.log('item | type | Shop bid | used by');
  for (const id of Object.keys(SRC).sort()) {
    const it = ITEMS[id] || {};
    if (GEAR.includes(it.type)) continue;
    n++;
    const u = USES[id] ? USES[id].length + ' recipes' : temperText.includes('"' + id + '"') ? 'Tempering' : it.teaches ? 'pattern' : it.type === 'key' ? 'key' : 'SHOP ONLY';
    if (u === 'SHOP ONLY') shop++;
    console.log([nameOf(id), it.type || '-', bid(id), u].join(' | '));
  }
  console.log(n + ' non-gear items drop on open grounds; ' + shop + ' have no use but the Shop.');
} else { console.error('inputs | grounds | orphans | sinks'); process.exit(2); }
