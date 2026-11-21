#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/sources.mjs — THE SOURCE ATLAS: every item in the game and every way to get it, priced at every checkpoint
// (50-standards 10.1 and 10.5; Tyler 2026-11-21: "is the audit taking into account crafting, all the possible drops in the game,
// gathering ... We need to be taking EVERYTHING into consideration").
//
//   node tools/balance-program/sources.mjs                 build tools/balance-program/atlas.json from the data rows and the cached
//                                                          ground rates (ground-rates.json, MID), moved to LOW and BiS by the progression
//                                                          grid (progression-grid.json, else progression-grid-quick.json, through
//                                                          progression-grid.mjs readGrid; the kits are grid-kit.mjs loadKits kitFor).
//                                                          Prints the counts, the lists (no source, no use, no cost, one way only,
//                                                          recipes that cannot be made) and bands A1 to A6 and T1. Plays nothing.
//   node tools/balance-program/sources.mjs --quick         the same on the release guard's 12 checkpoints, no kits (A4, A5 skipped)
//   node tools/balance-program/sources.mjs --measure [--quick] [--fresh] [--only g1,g2] [--workers 4] [--cpu-max 85]
//                                                          PLAY the ground-rate table first (atlas/measure.mjs: every ground at both
//                                                          ends of its band, parties 1 to 4, every tier, MID; the worker pool, resumable)
//   node tools/balance-program/sources.mjs --item <id>     one item: every source and its cost, a lone hero and a four, every checkpoint
//   node tools/balance-program/sources.mjs --list <name>   one list in full: noSource noUse noCost oneWay unmakeable a4 a5 a6
//   node tools/balance-program/sources.mjs --selftest      HERMETIC: plants an item with no source, a recipe whose output nothing uses and
//                                                          a drop moved to a ground nobody can enter, and each must land on its list
//
// The units: hunted hours (the party's), rested hours (the account's), gold, and DAYS at the 12 hour day (atlas/cost.mjs). Labels ride
// on every source (READ FROM DATA, MEASURED, CITED, PROJECTED, PLANNED). The market is a floor and a ceiling, never a price.
// Exit 0 when it ran (bands start in report: 50-standards 5.4), 1 on a selftest miss, 2 on a bad argument.
//
// mutant-anchors: none — --selftest plants its cases into the loaded data bundle in memory; no tracked file is patched
// ci-step: economy-selftests | Source atlas - an item with no source, a source nothing uses, a drop nobody can reach are each listed
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/sources.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isMain } from '../../tests/_is-main.mjs';
import { loadData, ROOT } from './atlas/data.mjs';
import { loadRates } from './atlas/rates.mjs';
import { buildAtlas } from './atlas/build.mjs';
import { loadKits } from './atlas/kits.mjs';
import { CHECKPOINTS, GUARD_CHECKPOINTS, PARTIES } from './standards.mjs';
import { styleOf } from './atlas/rates.mjs';
import { readGrid } from './progression-grid.mjs';

export const ATLAS_FILE = join(ROOT, 'tools', 'balance-program', 'atlas.json');
export const RATES_FILE = join(ROOT, 'tools', 'balance-program', 'ground-rates.json');

/** The progression grid the atlas and the solver read (its full cache, else the release's quick one), labelled, or null. */
export function gridOf() {
  const full = readGrid(false), g = full || readGrid(true);
  if (g) Object.defineProperty(g, '_label', { value: (full ? 'progression-grid.json' : 'progression-grid-quick.json') + ' ' + (g.commit || '?') + ', ' + Object.keys(g.cells || {}).length + ' cells', enumerable: false });
  return g;
}
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const commitOf = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };
/* every style a party of 50-standards 1.3 seats */
export const STYLES_PLAYED = Object.freeze([...new Set(PARTIES.flatMap((p) => p.seats.flat()).map(styleOf))]);

/** Build the atlas (no write). opts: { quick, D, rates, grid, kits: false to skip, checkpoints } */
export async function atlasOf(opts = {}) {
  const D = opts.D || await loadData();
  const rates = opts.rates !== undefined ? opts.rates : loadRates(RATES_FILE);
  const grid = opts.grid !== undefined ? opts.grid : gridOf();
  const kits = opts.kits === false ? null : await loadKits(ROOT, D);
  const checkpoints = opts.checkpoints || (opts.quick ? GUARD_CHECKPOINTS : CHECKPOINTS);
  const atlas = buildAtlas({ D, rates, grid, kits, checkpoints, styles: STYLES_PLAYED });
  return { atlas, D, rates, grid, kits };
}

export function writeAtlas(atlas, meta) {
  const { _pricer, _sources, ...plain } = atlas;
  const doc = { schema: 'hearthrise.balance-program.atlas/1', ...meta, ...plain };
  writeFileSync(ATLAS_FILE, JSON.stringify(doc) + '\n');
  return ATLAS_FILE;
}

function printSummary(a, meta) {
  const c = a.counts, L = a.lists, B = a.bands;
  console.log('ATLAS on ' + meta.commit + ' (' + meta.checkpoints.length + ' checkpoints; rates: ' + meta.rates + '; grid: ' + meta.grid + '; ' + meta.ms + ' ms)');
  console.log('items ' + c.realItems + ' (+' + (c.items - c.realItems) + ' upgrades) | sources ' + c.sources + ' (' + c.open + ' OPEN) | by kind ' + JSON.stringify(c.byKind) + ' | by state ' + JSON.stringify(c.byState));
  console.log('band | measured | note');
  console.log(['A1 items with no OPEN source', B.A1.measured + ' (' + B.A1.undeclared + ' undeclared)', B.A1.note].join(' | '));
  console.log(['A2 items with a source and no use', B.A2.measured + ' (' + B.A2.sources + ' sources)', ''].join(' | '));
  console.log(['A3 OPEN sources with no time cost', B.A3.measured + ' of ' + B.A3.of, ''].join(' | '));
  console.log(['A4 MID slots with no source in band', B.A4.measured, B.A4.note].join(' | '));
  console.log(['A5 BiS kits missing a kind', B.A5.measured, B.A5.note].join(' | '));
  console.log(['A6 slowest / fastest way', B.A6.over3 + ' over 3, ' + B.A6.over5 + ' over 5, of ' + B.A6.of + (B.A6.bis ? '; in BiS ' + B.A6.bis.over3 + ' over 3, ' + B.A6.bis.over5 + ' over 5, of ' + B.A6.bis.of : ''), 'target at most 3, red over 5'].join(' | '));
  console.log(['T1 rested days to 99 at 12 h', Object.entries(B.T1).map(([k, v]) => k + ' ' + v).join(', '), 'target 60 to 120, red under 30 or over 180'].join(' | '));
  console.log('lists: noSource ' + L.noSource.length + ', noUse ' + L.noUse.length + ', noCost ' + L.noCost.length + ', oneWay ' + L.oneWay.length + ', unmakeable recipes ' + L.unmakeable.length + ', a4 ' + L.a4.length + ', a5 ' + L.a5.length);
  const byDecl = L.noSource.reduce((m, x) => { const k = x.declared || 'UNDECLARED'; m[k] = (m[k] || 0) + 1; return m; }, {});
  console.log('noSource by fate: ' + JSON.stringify(byDecl));
  console.log('unmakeable: ' + L.unmakeable.slice(0, 8).map((u) => u.sid + ' (' + u.why + ')').join('; ') + (L.unmakeable.length > 8 ? ' ...' : ''));
  console.log('noCost (OPEN): ' + L.noCost.filter((x) => x.state === 'OPEN').slice(0, 8).map((u) => u.sid + ' (' + u.why + ')').join('; '));
  console.log('A6 worst: ' + L.a6.slice(0, 6).map((x) => x.id + ' x' + x.ratio + ' at ' + x.cp + ' (' + x.fastest + ' vs ' + x.slowest + ')').join('; '));
}

function printItem(a, id) {
  const it = a.items[id];
  if (!it) { console.error('no item ' + id); process.exit(2); }
  console.log(id + ': ' + it.n + ' | ' + [it.type, it.slot, 'tier ' + it.tier, 'Level ' + it.reqLv].join(', ') + ' | ' + it.state + ' | uses: ' + (it.uses.join('; ') || 'NONE'));
  console.log('cheapest way by checkpoint (lone MID, Normal, 12 rested h): ' + it.best.map(([c, sid, d]) => 'from ' + c + ' ' + sid + ' ' + d + ' d').join(' | '));
  console.log('source | kind | system | state | opens | limit | label | lone Normal [cp hunted rested gold days p10 p50 p90] | four, hardest');
  for (const sid of it.sources) {
    const s = a.sources[sid];
    const lone = s.cost && (s.cost['1|normal'] || null), keys = s.cost ? Object.keys(s.cost).filter((k) => k.startsWith('4|')) : [];
    const four = keys.length ? s.cost[keys[keys.length - 1]] : null;
    console.log([sid, s.kind, s.system, s.state, s.opens, s.limit ? s.limit.n + ' a ' + s.limit.per : '-', s.label, lone ? JSON.stringify(lone.slice(0, 3)) : (s.blank ? 'BLANK ' + Object.values(s.blank)[0] : '-'),
      four ? keys[keys.length - 1] + ' ' + JSON.stringify(four.slice(0, 3)) : '-'].join(' | '));
  }
}

async function selftest() {
  const t0 = Date.now();
  const cps = [10, 30, 60];
  const rates = loadRates(RATES_FILE);
  if (!rates) { console.error('selftest: no ' + RATES_FILE + ' (run --measure)'); process.exit(1); }
  const fails = [];
  const check = (name, ok, detail) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ': ' + detail : '')); if (!ok) fails.push(name); };
  /* control */
  const D0 = await loadData();
  const { atlas: a0 } = await atlasOf({ D: D0, rates, grid: null, kits: false, checkpoints: cps });
  check('control: the Thicket\'s gray wolves drop something priced', Object.values(a0.sources).some((s) => s.kind === 'drop' && s.state === 'OPEN' && s.cost && s.item && a0.sources['drop:meadowbrook_thicket:' + s.item]));
  check('control: no planted id on any list', !a0.lists.noSource.some((x) => x.id === 'zz_atlas_plant'));
  /* the ground-rate cells: a harder tier is played at ITS pull (cell.mjs takes the pull only from cell.density), and the cached table says so */
  {
    const { measureJobs } = await import('./atlas/rates.mjs');
    const { pullOf } = await import('./atlas/measure.mjs');
    const jobs = measureJobs({ HUNT_GROUNDS: D0.HUNT_GROUNDS, HUNT_INDEX: D0.HUNT_INDEX, OPEN_GROUNDS: D0.OPEN_GROUNDS, PARTIES, tiersOf: D0.tiersOf, pullOf, quick: false, seeds: 1, hours: 1, only: ['krells_hold'] });
    const hard = jobs.filter((j) => j.meta.tier !== 'normal'), bad = hard.filter((j) => (j.density ?? null) !== (pullOf(j.ground, j.meta.tier, j.meta.size) ?? null));
    check('a harder-tier ground-rate cell carries its tier\'s pull', hard.length > 0 && !bad.length && jobs.filter((j) => j.meta.tier === 'normal').every((j) => j.density === undefined), hard.length + ' harder cells, ' + bad.length + ' without the pull; Deadly x4 pulls ' + pullOf('krells_hold', 'deadly', 4));
    const four = (tier) => rates.rows.find((r) => r.ground === 'krells_hold' && r.size === 4 && r.tier === tier);
    const n = four('normal'), d = four('deadly');
    check('the cached table was played with the pull: a four kills faster on Deadly than on Normal at Krell\'s Hold', !!n && !!d && d.killsPerH > n.killsPerH * 1.3, n && d ? 'Normal ' + n.killsPerH + ', Deadly ' + d.killsPerH + ' kills an hour' : 'rows missing');
  }
  /* M1: an item row with no source -> noSource, undeclared */
  const D1 = await loadData();
  D1.ITEMS.zz_atlas_plant = { n: 'Planted Trinket', type: 'jewelry', slot: 'ring', tier: 2, v: 100, reqLv: 15 };
  const { atlas: a1 } = await atlasOf({ D: D1, rates, grid: null, kits: false, checkpoints: cps });
  const hit1 = a1.lists.noSource.find((x) => x.id === 'zz_atlas_plant');
  check('M1 an item with no source is listed, undeclared', !!hit1 && !hit1.declared, hit1 ? JSON.stringify(hit1) : 'missing');
  /* M2: a recipe whose output nothing uses -> noUse + sourcesUnused */
  const D2 = await loadData();
  D2.ITEMS.zz_atlas_widget = { n: 'Planted Widget', v: 5 };
  D2.RECIPES.smithing.push({ id: 'zz_make_widget', name: 'Make Widget', input: 'copper_ore', inputQty: 1, output: 'zz_atlas_widget', xp: 1, req: 1, ms: 3000 });
  const { atlas: a2 } = await atlasOf({ D: D2, rates, grid: null, kits: false, checkpoints: cps });
  check('M2 a recipe whose output nothing uses is listed', a2.lists.noUse.some((x) => x.id === 'zz_atlas_widget') && a2.lists.sourcesUnused.includes('recipe:zz_make_widget:zz_atlas_widget'));
  /* M3: a drop moved to a ground nobody can enter -> its only item leaves OPEN */
  const D3 = await loadData();
  const victim = 'kingstooth';   // the Rat King's call-only piece: one source, his called room
  const callRow = Object.values(D3.BOSS_CALLS).find((c) => c.callOnly === victim);
  const moved = D3.MONSTERS[callRow.monster].drops.find((d) => d.id === victim);
  D3.MONSTERS[callRow.monster].drops = D3.MONSTERS[callRow.monster].drops.filter((d) => d !== moved);
  D3.MONSTERS.zz_locked = { name: 'Locked', drops: [moved] };
  D3.HUNT_GROUNDS.zz_nowhere = { id: 'zz_nowhere', pockets: [{ spawns: [{ monster: 'zz_locked' }] }] };
  D3.HUNT_INDEX.zz_nowhere = { id: 'zz_nowhere', band: [400, 400] };
  const { atlas: a3 } = await atlasOf({ D: D3, rates, grid: null, kits: false, checkpoints: cps });
  const it3 = a3.items[victim];
  check('M3 a drop moved to a ground nobody can enter: the item has no OPEN source', !!it3 && it3.state !== 'OPEN' && a3.lists.noSource.some((x) => x.id === victim), it3 ? it3.state : 'missing');
  check('control again: the moved item was OPEN before', a0.items[victim] && a0.items[victim].state === 'OPEN');
  console.log((fails.length ? 'SELFTEST RED: ' + fails.join(', ') : 'selftest green: 3 mutants caught, controls clean') + ' (' + (Date.now() - t0) + ' ms)');
  process.exit(fails.length ? 1 : 0);
}

async function main() {
  if (has('selftest')) return selftest();
  const t0 = Date.now();
  if (has('measure')) {
    const { measureGroundRates } = await import('./atlas/measure.mjs');
    const D = await loadData();
    const r = await measureGroundRates(D, { quick: has('quick'), fresh: has('fresh'), workers: Number(arg('workers', 4)), cpuMax: Number(arg('cpu-max', 85)), only: arg('only') ? arg('only').split(',') : null });
    console.log('ground rates: ' + r.table.rows.length + ' rows (' + r.table.cells + ' cells, ' + r.res.failed + ' failed) in ' + Math.round((Date.now() - t0) / 1000) + ' s -> ' + RATES_FILE);
  }
  const quick = has('quick');
  const { atlas, rates, grid } = await atlasOf({ quick, kits: quick ? false : undefined });
  const meta = { commit: commitOf(), checkpoints: quick ? GUARD_CHECKPOINTS : CHECKPOINTS, rates: rates ? rates.commit + (rates.quick ? ' quick' : '') + ', ' + rates.rows.length + ' cells' : 'NONE',
    grid: grid ? grid._label + ' (LOW and BiS: MID x its own ratio)' : 'NONE: LOW and BiS print as MID until progression-grid.mjs has run', ms: Date.now() - t0 };
  if (arg('item')) return printItem(atlas, arg('item'));
  if (arg('list')) { const l = atlas.lists[arg('list')]; if (!l) { console.error('lists: ' + Object.keys(atlas.lists).join(' ')); process.exit(2); } for (const x of l) console.log(JSON.stringify(x)); return; }
  if (!quick) writeAtlas(atlas, meta);
  meta.ms = Date.now() - t0;
  printSummary(atlas, meta);
  if (!quick) console.log('wrote ' + ATLAS_FILE);
}

if (isMain(import.meta.url)) main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
