#!/usr/bin/env node
// tools/balance-program/redesign/r4/item-levels.mjs — lane/r4: the item Levels (reqLv) the v1-climb cells wear, per seat, at base and one
// band back (weapon, armor), so a measured move can be read against the item Levels it moved. No engine run.
//   node tools/balance-program/redesign/r4/item-levels.mjs        Exit 0
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { loadGridData, buildCell } = await imp('tools/balance-program/progression-grid.mjs');
const { loadKits } = await imp('tools/balance-program/grid-kit.mjs');
const { ITEMS } = await imp('src/data/items.js');
const { ARMOUR_SLOTS } = await imp('src/data/core-model.js');
const D = await loadGridData(ROOT), K = await loadKits(ROOT);
for (const L of [20, 60, 110, 185, 400]) for (const step of [null, 'step:weapon', 'step:armor']) {
  const b = buildCell(D, K, { L, gear: 'mid', styles: ['hammer', 'bow', 'mage', 'healer'], tier: 'normal', ground: 'muster_barrows', ...(step ? { step } : {}) });
  const eqs = (b.cell.gearBySeat || []).map((g) => (g && g.also) || {});
  const w = eqs.map((e) => (ITEMS[e.weapon] || {}).reqLv);
  const a = eqs.map((e) => { const l = ARMOUR_SLOTS.map((k) => (ITEMS[e[k]] || {}).reqLv).filter(Boolean); return l.length ? Math.round(l.reduce((x, y) => x + y, 0) / l.length) : null; });
  console.log('Level ' + String(L).padEnd(4) + (step || 'base').padEnd(12) + 'weapon IL ' + w.join('/').padEnd(16) + 'armor IL ' + a.join('/'));
}
