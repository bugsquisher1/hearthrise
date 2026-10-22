#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/storage-view.mjs — THE STORAGE WINDOW SORTS AND FILTERS (Tyler 10-22:
// "storage doesn't have a way to sort or filter"), IN NODE
//
//   node tests/storage-view.mjs             the tests, on the real modules
//   node tests/storage-view.mjs --selftest  every planted defect must turn a test red
//
// The pure model under the Storage window's toolbar (src/shell/windows/storage.js)
// and the Inventory's: src/shell/bag-model.js (kindOf, view), src/shell/storage-
// model.js (storePrefsOf, markStored) and the two residue fields they keep
// (src/session/residue.js storeView, storeSeen). The window itself is played in
// tests/alpha-windows.mjs AW-21.
//   V1  every kind chip the player asked for exists, and the rows file themselves
//       into it from the catalogue (bars, planks, blanks, seeds are Materials;
//       trophies and relics are Rare)
//   V2  a chip and the search filter; both together narrow
//   V3  the sorts: Type, Name, Value (the server's bids), Count, Newest
//   V4  "recently added": the first look marks all as old, a new or grown stack
//       is the newest, a shrunk one keeps its place, one taken out loses its mark,
//       nothing changed writes nothing, a depot over the cap writes nothing
//   V5  the remembered chip and sort fall back on junk; both residue fields are
//       on the allowlist and bounded (storeSeen by the fullest depot the data allows)
//
// The selftest copies src/ to a temp tree, plants one defect per arm and
// requires the named test to fail. No ?v= on imports here (tests/**).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BAG = 'src/shell/bag-model.js';
const STORE = 'src/shell/storage-model.js';
const RES = 'src/session/residue.js';

async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  return { B: await import(u(BAG)), S: await import(u(STORE)), R: await import(u(RES)), H: await import(u('src/data/homestead-tiers.js')) };
}

async function runTests({ B, S, R, H }) {
  const fails = [];
  const ok = (test, cond, msg) => { if (!cond) fails.push(test + ' ' + msg); };
  const ids = (rows) => rows.map((r) => r.id).join(',');

  /* V1 — the chips, and the rows that file into them */
  const cats = new Set(B.BAG_CATS.map(([id]) => id));
  for (const c of ['all', 'food', 'drink', 'ammo', 'gear', 'material', 'loot', 'rare']) ok('V1', cats.has(c), 'no "' + c + '" chip in BAG_CATS');
  const want = { shrimp: 'food', carrot_juice: 'drink', bronze_arrows: 'ammo', bronze_helm: 'gear', rat_incisor: 'loot',
    copper_bar: 'material', oak_plank: 'material', rune_blank: 'material', turnip_seed: 'material', emberheart: 'rare', dragon_relic: 'rare' };
  for (const [id, k] of Object.entries(want)) ok('V1', B.kindOf(id) === k, id + ' files under ' + B.kindOf(id) + ', not ' + k);

  const items = [
    { id: 'shrimp', qty: 5 }, { id: 'copper_bar', qty: 40 }, { id: 'bronze_helm', qty: 1 },
    { id: 'emberheart', qty: 1 }, { id: 'oak_plank', qty: 12 }, { id: 'rat_incisor', qty: 11 },
  ];
  const v = (o) => B.view(items.map((r) => ({ ...r })), o);

  /* V2 — filter */
  ok('V2', ids(v({ cat: 'material', sort: 'name' })) === 'copper_bar,oak_plank', 'the Materials chip shows ' + ids(v({ cat: 'material', sort: 'name' })));
  ok('V2', ids(v({ cat: 'rare' })) === 'emberheart', 'the Rare chip shows ' + ids(v({ cat: 'rare' })));
  ok('V2', ids(v({ query: 'shr' })) === 'shrimp', 'the search "shr" finds ' + ids(v({ query: 'shr' })));
  ok('V2', ids(v({ cat: 'material', query: 'oak' })) === 'oak_plank', 'Materials + "oak" shows ' + ids(v({ cat: 'material', query: 'oak' })));
  ok('V2', v({ cat: 'food', query: 'oak' }).length === 0, 'Food + "oak" is not empty');
  ok('V2', v({}).length === items.length, 'All with no search hides a stack');

  /* V3 — sorts */
  const count = ids(v({ sort: 'count' }));
  ok('V3', count === 'copper_bar,oak_plank,rat_incisor,shrimp,bronze_helm,emberheart', 'Count (most first, then by name) reads ' + count);
  const byName = v({ sort: 'name' }).map((r) => r.id);
  ok('V3', byName[0] === 'bronze_helm' && byName[byName.length - 1] === 'shrimp', 'Name reads ' + byName.join(','));
  const bids = new Map([['shrimp', 100], ['copper_bar', 1], ['bronze_helm', 30]]);
  const val = ids(v({ sort: 'value', bids }));
  ok('V3', val.startsWith('shrimp,copper_bar,bronze_helm'), 'Value (the stack at the server\'s bid, most first; no bid last) reads ' + val);
  const type = v({ sort: 'type' }).map((r) => B.kindOf(r.id));
  ok('V3', type.join() === 'gear,food,loot,material,material,rare', 'Type groups by the chip order: ' + type.join());
  const seen = { shrimp: [5, 3], copper_bar: [40, 1], bronze_helm: [1, 0], emberheart: [1, 0], oak_plank: [12, 2] };
  const newest = ids(v({ sort: 'newest', seen }));
  ok('V3', newest.startsWith('rat_incisor,shrimp,oak_plank,copper_bar'), 'Newest (unmarked first, then the latest mark) reads ' + newest);

  /* V4 — the "recently added" marks */
  const MAX = 10;
  const a = S.markStored(null, [{ id: 'shrimp', qty: 5 }, { id: 'copper_bar', qty: 40 }], MAX);
  ok('V4', a && a.shrimp[1] === 0 && a.copper_bar[1] === 0, 'the first look does not mark everything as new: ' + JSON.stringify(a));
  ok('V4', S.markStored(a, [{ id: 'shrimp', qty: 5 }, { id: 'copper_bar', qty: 40 }], MAX) === null, 'an unchanged storage writes the marks again');
  const b = S.markStored(a, [{ id: 'shrimp', qty: 5 }, { id: 'copper_bar', qty: 40 }, { id: 'oak_plank', qty: 3 }], MAX);
  ok('V4', b && b.oak_plank[1] === 1 && b.shrimp[1] === 0, 'a stack put in is not the newest: ' + JSON.stringify(b));
  const c = S.markStored(b, [{ id: 'shrimp', qty: 9 }, { id: 'copper_bar', qty: 20 }, { id: 'oak_plank', qty: 3 }], MAX);
  ok('V4', c && c.shrimp[1] === 2 && c.copper_bar[1] === 0 && c.copper_bar[0] === 20, 'a grown stack is not the newest, or a shrunk one moved: ' + JSON.stringify(c));
  const d = S.markStored(c, [{ id: 'shrimp', qty: 9 }, { id: 'oak_plank', qty: 3 }], MAX);
  ok('V4', d && !('copper_bar' in d), 'a stack taken out keeps its mark: ' + JSON.stringify(d));
  const e = S.markStored(d, [{ id: 'shrimp', qty: 9 }, { id: 'oak_plank', qty: 3 }, { id: 'copper_bar', qty: 1 }], MAX);
  ok('V4', e && e.copper_bar[1] === 3, 'a stack stored again after it was taken out is not the newest: ' + JSON.stringify(e));
  const many = Array.from({ length: MAX + 1 }, (_, i) => ({ id: 'x' + i, qty: 1 }));
  ok('V4', S.markStored(null, many, MAX) === null, 'a storage over the cap writes marks it would lose (a write on every paint)');

  /* V5 — the remembered view and the residue bounds */
  const p0 = S.storePrefsOf({ storeView: { cat: 'nonsense', sort: 'nope' } });
  ok('V5', p0.cat === 'all' && p0.sort === 'type', 'junk prefs do not fall back to All / Type: ' + JSON.stringify(p0));
  const p1 = S.storePrefsOf({ storeView: { cat: 'rare', sort: 'count' } });
  ok('V5', p1.cat === 'rare' && p1.sort === 'count', 'a remembered chip and sort are lost: ' + JSON.stringify(p1));
  ok('V5', R.RESIDUE_FIELDS.includes('storeView') && R.RESIDUE_FIELDS.includes('storeSeen'), 'storeView / storeSeen are not on the residue allowlist');
  const sv = R.sanitizeResidueField('storeView', { cat: 'rare', sort: 'count', advanced: true, evil: 'x'.repeat(99), extra: 1 });
  ok('V5', JSON.stringify(sv) === '{"cat":"rare","sort":"count"}', 'storeView keeps more than the chip and sort: ' + JSON.stringify(sv));
  const full = H.STORAGE_CHESTS.reduce((n, ch) => n + ch.stacks, H.DEPOT_BASE_STACKS);
  ok('V5', R.STORE_SEEN_MAX === full, 'STORE_SEEN_MAX ' + R.STORE_SEEN_MAX + ' is not the fullest depot the data allows (' + full + ')');
  const forged = Object.fromEntries(Array.from({ length: full + 50 }, (_, i) => ['it' + i, [1, i]]));
  forged['BAD ID'] = [1, 1]; forged.neg = [-1, 2];
  const ss = R.sanitizeResidueField('storeSeen', forged);
  ok('V5', Object.keys(ss).length === full && !('BAD ID' in ss) && !('neg' in ss) && ss['it' + (full + 49)], 'a forged storeSeen is not bounded to the newest ' + full + ' good marks (' + Object.keys(ss).length + ')');
  return fails;
}

const MUTANTS = [
  { test: 'V1', file: BAG, from: "if (it.raw || it.tag === 'crafting-mat' || it.seed || inputSet().has(id)) return 'material';", to: "if (it.raw || it.tag === 'crafting-mat') return 'material';" },
  { test: 'V1', file: BAG, from: "  if (it.type === 'trophy' || RARE_TAGS.has(it.tag) || RARE_RUNGS.has(it.rarity)) return 'rare';\n", to: '' },
  { test: 'V2', file: BAG, from: "(cat === 'all' || kindOf(r.id) === cat)", to: 'true' },
  { test: 'V3', file: BAG, from: '    count: (a, b) => b.qty - a.qty || byName(a, b),\n', to: '' },
  { test: 'V4', file: STORE, from: 'out[id] = [qty, !prev ? 0 : s && qty <= s[0] ? s[1] : next++];', to: 'out[id] = [qty, !prev ? 0 : s ? s[1] : next++];' },
  { test: 'V4', file: STORE, from: 'out[id] = [qty, !prev ? 0 : s && qty <= s[0] ? s[1] : next++];', to: 'out[id] = [qty, s && qty <= s[0] ? s[1] : next++];' },
  { test: 'V4', file: STORE, from: '  if (list.length > max) return null;\n', to: '' },
  { test: 'V4', file: STORE, from: "keys.every((id) => out[id] && out[id][0] === prev[id][0] && out[id][1] === prev[id][1])) return null;", to: 'false) return null;' },
  { test: 'V5', file: STORE, from: "sort: v && SORT_IDS.has(v.sort) ? v.sort : 'type'", to: "sort: v && v.sort ? v.sort : 'type'" },
  { test: 'V5', file: RES, from: '  storeView: sanitizeStoreView,', to: '  storeView: sanitizeBagView,' },
  { test: 'V5', file: RES, from: 'export const STORE_SEEN_MAX = STORAGE_CHESTS.reduce((n, c) => n + c.stacks, DEPOT_BASE_STACKS);', to: 'export const STORE_SEEN_MAX = 512;' },
];

async function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), 'storage-view-'));
  let caught = 0;
  try {
    for (const m of MUTANTS) {
      const base = join(tmp, String(caught) + '-' + m.test);
      const skip = new Set(['styles', 'vendor'].map((n) => join(ROOT, 'src', n)));
      mkdirSync(join(base, 'src'), { recursive: true });
      cpSync(join(ROOT, 'src'), join(base, 'src'), { recursive: true, filter: (s) => !skip.has(s) });
      const p = join(base, m.file);
      const src = readFileSync(p, 'utf8');
      if (!src.includes(m.from)) throw new Error('selftest: anchor for ' + m.test + ' not found in ' + m.file);
      writeFileSync(p, src.replace(m.from, m.to));
      const fails = await runTests(await load(base));
      if (!fails.some((f) => f.startsWith(m.test + ' '))) { console.error('  MISSED: ' + m.test + ' stayed green with its defect planted (' + m.file + ')'); process.exit(1); }
      caught++;
      console.log('  caught  ' + m.test + '  (' + m.file + ')');
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log('storage-view selftest: ' + caught + '/' + MUTANTS.length + ' planted defects caught');
}

if (process.argv.includes('--selftest')) {
  const clean = await runTests(await load(ROOT));
  if (clean.length) { console.error('storage-view selftest: the CLEAN arm is red\n  ' + clean.join('\n  ')); process.exit(1); }
  await selftest();
} else {
  const fails = await runTests(await load(ROOT));
  if (fails.length) { console.error('storage-view: ' + fails.length + ' failing\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('storage-view: the chips, the search, the five sorts and the "recently added" marks hold');
}
