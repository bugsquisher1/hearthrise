#!/usr/bin/env node
// tools/balance-sim/pacefinal-table.mjs — lane/b-pace-final's READS, off the engine's cells (plan pacefinal) and the pace snapshot.
//
//   node tools/balance-sim/sim.mjs --plan pacefinal --out tools/balance-sim/out/pacefinal
//   node tools/balance-sim/pacefinal-table.mjs [--in tools/balance-sim/out/pacefinal]
//
// Prints: the tiers per ground (median of the eight ways to fight alone), the fastest honest pace (each Level's reference
// rate times the median style's best tier that held and paid on that ground, nearest Level of the grid), the skill rates at
// 50, the Warrens at 50 against LEVEL_PACE.contract, the casters on each rune tier, and the healer's "needs healing" line.
// Every number is read off the cells; the only arithmetic is pooling (hours-weighted), medians and ratios.
import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCell } from './tiers-table.mjs';
import { hoursTo, referenceRate, loadPaceData, SNAPSHOT } from './pace.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DIR = resolve(arg('in', join(HERE, 'out', 'pacefinal')));
const cells = readFileSync(join(DIR, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.heroes);
const { BUILD } = await import(pathToFileURL(join(ROOT, 'src/build-info.js')).href);
const XP = await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href + '?v=' + BUILD.version);
const { LEVEL_PACE } = await import(pathToFileURL(join(ROOT, 'src/data/core-model.js')).href);
const SHORT = { meadowbrook_thicket: 'Thicket', wickstead: 'Wickstead', millrace_sewer: 'Sewer', mosslight_glade: 'Glade', coppercap_warrens: 'Warrens', mill_cellar: 'Cellar' };
const k = (n) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(n)));
const signed = (n) => (n >= 0 ? '+' : '') + k(n);
const pct = (a, b) => (b ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : 'n/a');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const xOf = (c) => c.id.split(',x=')[1];
const who = (c) => c.heroes.map((h) => h.style).join('+');
const solo = (c) => c.heroes.length === 1;
const at = (pred) => cells.filter(pred);
const life = (r) => (r.deaths === 0 ? 'held' : r.hPerDeath < 1 ? Math.round(r.hPerDeath * 60) + ' min' : r.hPerDeath + ' h');
const MAIN = { tank: 'melee', sword: 'melee', hammer: 'melee', axes: 'melee', bow: 'ranged', crossbow: 'ranged', mage: 'magic', healer: 'magic' };

/* 1. THE TIERS, alone: per ground and Level, the median style's XP and net, how many of the eight held */
console.log('TIERS ALONE (median of 8 ways to fight; held = no death in 2 seeds x 2 h; per head per hour)');
console.log('| Ground, Level | Normal: XP, net | Dangerous: XP, net, held | Deadly: XP, net, held | Best honest tier / Normal (median style) |');
console.log('|---|---|---|---|---|');
const grid = {};
const groundsLevels = [...new Set(at((c) => /^T/.test(xOf(c)) && solo(c)).map((c) => c.ground + ':' + c.cell.level))];
for (const gl of groundsLevels.sort((a, b) => { const [ga, la] = a.split(':'), [gb, lb] = b.split(':'); return ga === gb ? la - lb : ga < gb ? -1 : 1; })) {
  const [g, L] = gl.split(':');
  const of = (t) => at((c) => c.ground === g && c.cell.level === Number(L) && solo(c) && xOf(c) === 'T' + t).map((c) => ({ style: c.heroes[0].style, ...readCell(c) }));
  const n = of('normal'), d = of('dangerous'), x = of('deadly');
  /* the best honest tier per style: the highest XP among the tiers it held AND netted >= 0 on */
  const ratios = n.map((r) => {
    const opts = [r, d.find((y) => y.style === r.style), x.find((y) => y.style === r.style)].filter((y) => y && y.deaths === 0 && y.net >= 0);
    return opts.length ? Math.max(...opts.map((y) => y.xp)) / r.xp : 1;
  });
  grid[g] = grid[g] || {}; grid[g][L] = median(ratios);
  const line = (rs) => k(median(rs.map((r) => r.xp))) + ', ' + signed(median(rs.map((r) => r.net)));
  console.log('| ' + SHORT[g] + ' ' + L + ' | ' + line(n) + ' | ' + line(d) + ', ' + d.filter((r) => r.deaths === 0).length + '/8 | ' + line(x) + ', ' + x.filter((r) => r.deaths === 0).length + '/8 | x' + median(ratios).toFixed(2) + ' |');
}

/* 2. THE FASTEST HONEST PACE: the snapshot's reference rate per Level, times the grid ratio of the ground the game sends a lone hero to */
const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const D = await loadPaceData(ROOT);
const R = referenceRate(snap, LEVEL_PACE.contract);
const ratioAt = (L) => {
  const g = D.recommend(L), lv = grid[g] ? Object.keys(grid[g]).map(Number) : [];
  if (!lv.length) return 1;
  const near = lv.reduce((a, b) => (Math.abs(b - L) < Math.abs(a - L) ? b : a));
  return grid[g][near];
};
const levels = [10, 25, 50];
const normalH = hoursTo(XP.charXpForLevel, (L) => (L < snap.ceiling ? R(L) : R(L)), levels);
const fastH = hoursTo(XP.charXpForLevel, (L) => (L < snap.ceiling ? R(L) * ratioAt(L) : R(L)), levels);
console.log('\nFASTEST HONEST PACE (reference rate x the median style\'s best tier that held and paid, by ground and nearest grid Level): '
  + levels.map((L) => 'L' + L + ' ' + fastH[L].toFixed(1) + ' h (Normal ' + normalH[L].toFixed(1) + ' h, target ' + LEVEL_PACE.targets.find((t) => t[0] === L)[1] + ')').join(', '));

/* 3. SKILL RATES AT 50: hours a skill level from 50 to 51, the way of fighting's own skill */
const step50 = XP.skillXpForLevel('melee', 51) - XP.skillXpForLevel('melee', 50);
console.log('\nSKILL AT 50 (step 50 -> 51 = ' + step50 + ' XP; hours a level; skill XP/h; Defense XP/h)');
console.log('| Way to fight | Skill | Warrens 50 Normal | Warrens 50 Deadly | Glade 50 Normal | Glade 50 Deadly |');
console.log('|---|---|---|---|---|---|');
for (const s of Object.keys(MAIN)) {
  const sk = MAIN[s];
  const one = (g, t) => { const c = at((x) => x.ground === g && x.cell.level === 50 && solo(x) && x.heroes[0].style === s && xOf(x) === 'T' + t)[0]; if (!c) return 'n/a';
    const r = c.heroes[0].skillXpPerH[sk] || 0; return (step50 / r).toFixed(1) + ' h (' + k(r) + ', Def ' + k(c.heroes[0].skillXpPerH.defense || 0) + ')'; };
  console.log('| ' + s + ' | ' + sk + ' | ' + one('coppercap_warrens', 'normal') + ' | ' + one('coppercap_warrens', 'deadly') + ' | ' + one('mosslight_glade', 'normal') + ' | ' + one('mosslight_glade', 'deadly') + ' |');
}

/* 4. THE WARRENS AT 50 AGAINST THE CONTRACT */
const contract = LEVEL_PACE.contract.a * 50 ** LEVEL_PACE.contract.b;
console.log('\nWARRENS AT 50 vs LEVEL_PACE.contract ' + k(contract) + ' (' + LEVEL_PACE.contract.a + ' x 50^' + LEVEL_PACE.contract.b + ')');
console.log('| Who | Normal: XP, net | Deadly: XP, net, life | Deadly / contract | A good place (net > 0, held)? |');
console.log('|---|---|---|---|---|');
for (const c of at((x) => x.ground === 'coppercap_warrens' && x.cell.level === 50 && xOf(x) === 'Tdeadly')) {
  const n = at((x) => x.ground === c.ground && x.cell.level === 50 && who(x) === who(c) && xOf(x) === 'Tnormal')[0];
  const a = readCell(n), b = readCell(c);
  console.log('| ' + who(c) + ' | ' + k(a.xp) + ', ' + signed(a.net) + ' | ' + k(b.xp) + ', ' + signed(b.net) + ', ' + life(b) + ' | ' + (b.xp / contract).toFixed(2) + ' | ' + (b.net > 0 && b.deaths === 0 ? 'yes' : 'no') + ' |');
}

/* 5. THE CASTERS ON EACH RUNE TIER (R1s = the default bar, Plain) */
console.log('\nRUNES (4 seeds x 2 h alone, 2 x 2 h the four; XP/h, Magic XP/h, bill, net, vs the Plain default)');
console.log('| Where | Who | Plain (default) | Scored, store 8 g | Scored, own | Etched, store 12 g | Etched, own |');
console.log('|---|---|---|---|---|---|---|');
const rkeys = ['R1s', 'R2s', 'R2o', 'R3s', 'R3o'];
const places = [...new Set(at((c) => /^R/.test(xOf(c))).map((c) => c.ground + ':' + c.cell.level + ':' + xOf(c).split(':')[1] + ':' + who(c)))];
for (const p of places) {
  const [g, L, t, w] = p.split(':');
  const of = (rk) => at((c) => c.ground === g && c.cell.level === Number(L) && who(c) === w && xOf(c) === rk + ':' + t)[0];
  const base = of('R1s'); if (!base) continue;
  const b0 = readCell(base);
  const magicOf = (c) => Math.round(c.heroes.filter((h) => h.style === 'mage' || h.style === 'healer').reduce((s, h) => s + (h.skillXpPerH.magic || 0), 0));
  const cellTxt = (rk) => { const c = of(rk); if (!c) return '-'; const r = readCell(c);
    return k(r.xp) + (rk === 'R1s' ? '' : ' (' + pct(r.xp, b0.xp) + ')') + ', M ' + k(magicOf(c)) + ', bill ' + k(r.store) + ', ' + signed(r.net) + (r.deaths ? ', ' + life(r) : ''); };
  console.log('| ' + SHORT[g] + ' ' + L + (t === 'normal' ? '' : ' ' + t) + ' | ' + w + ' | ' + rkeys.map(cellTxt).join(' | ') + ' |');
}

/* 6. THE HEALER'S LINE: Greater Mend under it, Green Sickness only over it */
console.log('\nHEALER\'S LINE (4 seeds x 2 h; the healer\'s own: Level XP, Magic XP/h, Mend casts/h, drinks/h, net; the party per head)');
console.log('| Where | Who | 70 (as built) | 80 | 90 |');
console.log('|---|---|---|---|---|');
const mplaces = [...new Set(at((c) => /^M/.test(xOf(c))).map((c) => c.ground + ':' + c.cell.level + ':' + who(c)))];
for (const p of mplaces) {
  const [g, L, w] = p.split(':');
  const txt = (pct2) => { const c = at((x) => x.ground === g && x.cell.level === Number(L) && who(x) === w && xOf(x) === 'M' + pct2)[0]; if (!c) return '-';
    const h = c.heroes.find((y) => y.style === 'healer'), r = readCell(c), dr = h.drinksPerH ? h.drinksPerH.own + h.drinksPerH.store : 0;
    return k(h.levelXpPerH) + ', M ' + k(h.skillXpPerH.magic || 0) + ', Mend ' + Math.round((h.castsPerH || {}).greater_mend || 0) + ', drinks ' + Math.round(dr) + ', ' + signed(h.profitPerH)
      + (c.heroes.length > 1 ? '; party ' + k(r.xp) + ', ' + signed(r.net) : '') + (r.deaths ? ', ' + life(r) : ''); };
  console.log('| ' + SHORT[g] + ' ' + L + ' | ' + w + ' | ' + [70, 80, 90].map(txt).join(' | ') + ' |');
}
/* the mage beside it, same places, as built: what the healer's Magic is compared with */
for (const [g, L] of [['mosslight_glade', 24], ['mosslight_glade', 50], ['coppercap_warrens', 50]]) {
  const c = at((x) => x.ground === g && x.cell.level === L && who(x) === 'mage' && xOf(x) === 'R1s:normal')[0];
  if (c) console.log('  mage beside it, ' + SHORT[g] + ' ' + L + ': ' + k(c.heroes[0].levelXpPerH) + ', M ' + k(c.heroes[0].skillXpPerH.magic || 0) + ', casts ' + JSON.stringify(c.heroes[0].castsPerH));
}
