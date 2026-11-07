#!/usr/bin/env node
// tools/balance-sim/tierrisk-table.mjs — lane/b-tier-risk's TABLES: a lone hero's harder tier against Normal on Wickstead and the Glade, per
// candidate row (plan tierrisk), the parties that share each row's power, and the fastest honest lone path to Level 50 per pair of rows.
//
//   node tools/balance-sim/sim.mjs --plan pacefinal --out tools/balance-sim/out/pacefinal      (Normal and today's rows, the same dice)
//   node tools/balance-sim/sim.mjs --plan tierrisk  --out tools/balance-sim/out/tierrisk
//   node tools/balance-sim/tierrisk-table.mjs [--pacefinal DIR] [--in DIR]
//
// Honest = no death in the cell's 2 seeds x 2 h and net gold at or above zero. The fastest honest path: each Level's reference rate (the pace
// snapshot) times the median way to fight's best honest tier on the ground the game sends a lone hero to, nearest Level of the grid; grounds
// not in the plan keep plan pacefinal's tiers. Every number is read off the cells; the only arithmetic is pooling, medians and ratios.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCell } from './tiers-table.mjs';
import { hoursTo, referenceRate, loadPaceData, SNAPSHOT } from './pace.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const load = (dir) => (existsSync(join(dir, 'cells.jsonl')) ? readFileSync(join(dir, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.heroes) : []);
const PF = load(resolve(arg('pacefinal', join(HERE, 'out', 'pacefinal'))));
const TR = load(resolve(arg('in', join(HERE, 'out', 'tierrisk'))));
const { BUILD } = await import(pathToFileURL(join(ROOT, 'src/build-info.js')).href);
const XP = await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href + '?v=' + BUILD.version);
const { LEVEL_PACE } = await import(pathToFileURL(join(ROOT, 'src/data/core-model.js')).href);
const SHORT = { wickstead: 'Wickstead', mosslight_glade: 'Glade', meadowbrook_thicket: 'Thicket', millrace_sewer: 'Sewer', coppercap_warrens: 'Warrens' };
const k = (n) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(n)));
const signed = (n) => (n >= 0 ? '+' : '') + k(n);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const who = (c) => c.heroes.map((h) => h.style).join('+');
const solo = (c) => c.heroes.length === 1;
const honest = (r) => r && r.deaths === 0 && r.net >= 0;

/* Normal: plan pacefinal's Tnormal alone, and its parties; Wickstead's parties from Knormal */
const normalOf = (g, L, w) => { const c = PF.find((x) => x.ground === g && x.cell.level === L && who(x) === w && x.cell.x === 'Tnormal') || TR.find((x) => x.ground === g && x.cell.level === L && who(x) === w && x.cell.x === 'Knormal'); return c ? readCell(c) : null; };
const { tierRowOf } = await import(pathToFileURL(join(ROOT, 'src/data/hunt-tiers.js')).href);
const todayKey = (g, tier) => { const r = tierRowOf(g, tier); return 'K' + tier + ':' + r.pull.join('') + ':' + r.dmgPm + ':' + r.xpPm; };
/* today's rows: plan pacefinal's T<tier>, else this plan's cell on today's row (Wickstead's parties) */
const todayCell = (g, L, w, tier) => PF.find((x) => x.ground === g && x.cell.level === L && who(x) === w && x.cell.x === 'T' + tier) || TR.find((x) => x.ground === g && x.cell.level === L && who(x) === w && x.cell.x === todayKey(g, tier));
const todayOf = (g, L, w, tier) => { const c = todayCell(g, L, w, tier); return c ? readCell(c) : null; };
const cands = [...new Set(TR.filter((c) => c.cell.x !== 'Knormal' && c.cell.x !== todayKey(c.ground, c.cell.x.slice(1).split(':')[0])).map((c) => c.ground + '|' + c.cell.x))].sort();

console.log('LONE (median of 8 ways to fight; XP x Normal; held = no death in 2 seeds x 2 h; median net and the median net on Normal)');
console.log('| Ground | Row (pull alone..four : power : XP) | Level | XP x Normal | Held | Net (Normal) | Honest |');
console.log('|---|---|---|---|---|---|---|');
const ratioGrid = {};
for (const gc of cands) {
  const [g, x] = gc.split('|');
  const tier = x.slice(1).split(':')[0];
  for (const L of [...new Set(TR.filter((c) => c.ground === g && c.cell.x === x && solo(c)).map((c) => c.cell.level))].sort((a, b) => a - b)) {
    const rows = TR.filter((c) => c.ground === g && c.cell.x === x && solo(c) && c.cell.level === L).map((c) => ({ style: c.heroes[0].style, r: readCell(c), n: normalOf(g, L, c.heroes[0].style) })).filter((y) => y.n);
    const ratio = median(rows.map((y) => y.r.xp / y.n.xp));
    ratioGrid[gc] = ratioGrid[gc] || {}; ratioGrid[gc][L] = Object.fromEntries(rows.map((y) => [y.style, y.r]));
    console.log('| ' + SHORT[g] + ' | ' + tier + ' ' + x.split(':').slice(1).join(' : ') + ' | ' + L + ' | ' + ratio.toFixed(2) + ' | ' + rows.filter((y) => y.r.deaths === 0).length + '/' + rows.length
      + ' | ' + signed(median(rows.map((y) => y.r.net))) + ' (' + signed(median(rows.map((y) => y.n.net))) + ') | ' + rows.filter((y) => honest(y.r)).length + '/' + rows.length + ' |');
  }
}

console.log('\nPARTIES (per head; XP x Normal; held; net)');
console.log('| Ground | Row | Level | Party | Today | Candidate |');
console.log('|---|---|---|---|---|---|');
for (const gc of cands) {
  const [g, x] = gc.split('|');
  const tier = x.slice(1).split(':')[0];
  for (const c of TR.filter((y) => y.ground === g && y.cell.x === x && !solo(y)).sort((a, b) => a.cell.level - b.cell.level || (who(a) < who(b) ? -1 : 1))) {
    const n = normalOf(g, c.cell.level, who(c)); const tr = todayOf(g, c.cell.level, who(c), tier);
    const r = readCell(c);
    const fmt = (z) => (z ? (n ? (z.xp / n.xp).toFixed(2) + 'x, ' : '') + k(z.xp) + ', ' + signed(z.net) + ', ' + (z.deaths ? z.deaths + ' death(s)' : 'held') : '-');
    console.log('| ' + SHORT[g] + ' | ' + tier + ' ' + x.split(':').slice(1).join(' : ') + ' | ' + c.cell.level + ' | ' + who(c) + ' | ' + fmt(tr) + ' | ' + fmt(r) + ' |');
  }
}

/* THE FASTEST HONEST LONE PATH per pair of rows on each ground (Dangerous, Deadly), the other grounds as plan pacefinal measured them */
const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const D = await loadPaceData(ROOT);
const R = referenceRate(snap, LEVEL_PACE.contract);
const STYLES = ['tank', 'sword', 'hammer', 'axes', 'bow', 'crossbow', 'mage', 'healer'];
const todayRatio = (g, L) => median(STYLES.map((s) => { const n = normalOf(g, L, s); if (!n) return 1; const best = [n, todayOf(g, L, s, 'dangerous'), todayOf(g, L, s, 'deadly')].filter(honest); return best.length ? Math.max(...best.map((z) => z.xp)) / n.xp : 1; }));
const candRatio = (g, L, dg, dl) => median(STYLES.map((s) => { const n = normalOf(g, L, s); if (!n) return 1; const best = [n, ratioGrid[g + '|' + dg]?.[L]?.[s], ratioGrid[g + '|' + dl]?.[L]?.[s]].filter(honest); return best.length ? Math.max(...best.map((z) => z.xp)) / n.xp : 1; }));
const gridLevels = (g) => [...new Set(PF.filter((c) => c.ground === g && c.cell.x === 'Tnormal' && solo(c)).map((c) => c.cell.level))];
const near = (g, L) => gridLevels(g).reduce((a, b) => (Math.abs(b - L) < Math.abs(a - L) ? b : a));
const pathHours = (pick) => hoursTo(XP.charXpForLevel, (L) => {
  if (L >= snap.ceiling) return R(L);
  const g = D.recommend(L);
  if (!gridLevels(g).length) return R(L);
  const at = near(g, L);
  return R(L) * (pick[g] ? candRatio(g, at, pick[g][0], pick[g][1]) : todayRatio(g, at));
}, [10, 25, 50]);
const today = pathHours({});
console.log('\nFASTEST HONEST LONE PATH, today: L10 ' + today[10].toFixed(1) + ' h, L25 ' + today[25].toFixed(1) + ', L50 ' + today[50].toFixed(1) + ' (Normal 169.8, target 168)');
const xs = (g, t) => cands.filter((c) => c.startsWith(g + '|K' + t + ':')).map((c) => c.split('|')[1]);
for (const wd of xs('wickstead', 'dangerous')) for (const wl of xs('wickstead', 'deadly')) for (const gd of xs('mosslight_glade', 'dangerous')) for (const gl of xs('mosslight_glade', 'deadly')) {
  const h = pathHours({ wickstead: [wd, wl], mosslight_glade: [gd, gl] });
  console.log('  W ' + wd.slice(1) + ' / ' + wl.slice(1) + '  G ' + gd.slice(1) + ' / ' + gl.slice(1) + ':  L10 ' + h[10].toFixed(1) + ', L25 ' + h[25].toFixed(1) + ', L50 ' + h[50].toFixed(1));
}
