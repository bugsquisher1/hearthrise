#!/usr/bin/env node
// tools/balance-sim/bite-table.mjs — lane/b-monster-bite's TABLE: Normal on Wickstead and the Glade with the monsters' own attack
// scaled (plan bite: x = B100 | B150 | B200 | B250, or the rows as written), read per ground and candidate.
//
//   node tools/balance-sim/sim.mjs --plan bite --out tools/balance-sim/out/bite
//   node tools/balance-sim/bite-table.mjs [--in DIR[,DIR2...]]      (a later folder's cell wins on a shared id)
//
// Per candidate: the lone hero at the floor (median of the 8 ways to fight: XP, margin = income / store bill - 1, the store
// bill's share of income, the worst way to fight's margin, deaths, the lowest median low point), the band's middle (XP, bill),
// the pairs 2 and 3 Levels under the floor and 5 under (per head: net gold, damage taken and food plus drinks an hour, deaths in
// 10 h), and a lone hero 5 under. Every number is read off the cells; the only arithmetic is pooling, medians and ratios.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCell } from './tiers-table.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DIRS = arg('in', join(HERE, 'out', 'bite')).split(',').map((d) => resolve(d));
const cells = [...new Map(DIRS.filter((d) => existsSync(join(d, 'cells.jsonl'))).flatMap((d) => readFileSync(join(d, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
  .filter((r) => r.heroes).map((r) => [r.id, r])).values()];
const k = (n) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(n)));
const signed = (n) => (n >= 0 ? '+' : '') + k(n);
const pct = (x) => (x == null ? 'no bill' : (x >= 0 ? '+' : '') + Math.round(x * 100) + '%');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const xOf = (c) => c.id.split(',x=')[1];
const who = (c) => c.heroes.map((h) => h.style).join('+');
/* per hero-hour across the cell's heroes */
const per = (c, f) => { const hrs = c.heroes.reduce((s, h) => s + h.hours, 0) || 1; return c.heroes.reduce((s, h) => s + (f(h) || 0) * h.hours, 0) / hrs; };
const taken = (c) => per(c, (h) => h.takenPerH);
const supplies = (c) => per(c, (h) => (h.eatsPerH ? h.eatsPerH.own + h.eatsPerH.store : 0) + (h.drinksPerH ? h.drinksPerH.own + h.drinksPerH.store : 0));
const FLOOR = { wickstead: [8, 13], mosslight_glade: [16, 24] };
const NAME = { wickstead: 'Wickstead', mosslight_glade: 'Glade' };
const xs = [...new Set(cells.map(xOf))].sort();

for (const g of Object.keys(FLOOR)) {
  const [floor, mid] = FLOOR[g];
  console.log('\n' + NAME[g].toUpperCase() + ' (floor ' + floor + ')');
  console.log('| Rows | Floor alone: XP, margin, bill share, worst margin, deaths, lowest low point | Middle ' + mid + ': XP, bill | Pairs at ' + (floor - 3) + '-' + (floor - 2) + ': net a head, taken, supplies, deaths in 10 h | 5 under: pair net, deaths in 10 h, lone net, deaths in 10 h |');
  console.log('|---|---|---|---|---|');
  for (const x of xs) {
    const at = (pred) => cells.filter((c) => c.ground === g && xOf(c) === x && pred(c));
    const fl = at((c) => c.heroes.length === 1 && c.cell.level === floor && !c.cell.gear).map((c) => ({ c, r: readCell(c) }));
    const md = at((c) => c.heroes.length === 1 && c.cell.level === mid).map((c) => ({ c, r: readCell(c) }));
    if (!fl.length) continue;
    const share = fl.map(({ r }) => (r.income ? r.store / r.income : 0));
    const margins = fl.map(({ r, c }) => ({ m: r.margin, s: who(c) }));
    const worst = margins.filter((m) => m.m != null).sort((a, b) => a.m - b.m)[0];
    const floorCol = k(median(fl.map(({ r }) => r.xp))) + ', ' + pct(median(margins.map((m) => (m.m == null ? 99 : m.m)))) + ', ' + Math.round(median(share) * 100) + '%, '
      + (worst ? worst.s + ' ' + pct(worst.m) : 'no bill') + ', ' + fl.reduce((s, { r }) => s + r.deaths, 0) + ' in ' + Math.round(fl.reduce((s, { r }) => s + r.hours, 0)) + ' h, ' + Math.min(...fl.map(({ r }) => r.hp)) + '%';
    const midCol = k(median(md.map(({ r }) => r.xp))) + ', ' + k(median(md.map(({ r }) => r.store)));
    const pairs = at((c) => c.heroes.length === 2 && c.cell.level >= floor - 3 && c.cell.level <= floor - 2);
    const pr = pairs.map((c) => ({ c, r: readCell(c) }));
    const range = (vs) => { const s = vs.sort((a, b) => a - b); return s.length ? (s[0] === s[s.length - 1] ? s[0] : s[0] + ' to ' + s[s.length - 1]) : '-'; };
    const pairCol = range(pr.map(({ r }) => signed(r.net)).map((v) => v)) === '-' ? '-' : [
      'net ' + [Math.min(...pr.map(({ r }) => r.net)), Math.max(...pr.map(({ r }) => r.net))].map(signed).join(' to '),
      'taken ' + [Math.min(...pr.map(({ c }) => taken(c))), Math.max(...pr.map(({ c }) => taken(c)))].map(k).join('-'),
      'supplies ' + [Math.min(...pr.map(({ c }) => supplies(c))), Math.max(...pr.map(({ c }) => supplies(c)))].map((v) => Math.round(v)).join('-'),
      'deaths ' + [Math.min(...pr.map(({ r }) => r.deaths / r.hours * 10)), Math.max(...pr.map(({ r }) => r.deaths / r.hours * 10))].map((v) => v.toFixed(1)).join('-')].join(', ');
    const p5 = at((c) => c.heroes.length === 2 && c.cell.level === floor - 5).map((c) => readCell(c));
    const l5 = at((c) => c.heroes.length === 1 && c.cell.level === floor - 5).map((c) => readCell(c));
    const fiveCol = p5.length ? 'pair ' + p5.map((r) => signed(r.net) + ' ' + (r.deaths / r.hours * 10).toFixed(1)).join(' / ') + ', lone ' + l5.map((r) => signed(r.net) + ' ' + (r.deaths / r.hours * 10).toFixed(1)).join(' / ') : '-';
    console.log('| ' + x + ' | ' + floorCol + ' | ' + midCol + ' | ' + pairCol + ' | ' + fiveCol + ' |');
  }
  /* per way to fight at the floor: margin and low point, each candidate */
  console.log('\n  floor alone, per way to fight (margin / lowest median low point):');
  const styles = [...new Set(cells.filter((c) => c.ground === g && c.heroes.length === 1 && c.cell.level === floor).map(who))];
  const gearOf = (c) => (c.cell.gear ? (c.cell.gear.starter ? ' practice set' : ' helm and body') : '');
  for (const gearTag of ['', ' helm and body', ' practice set']) for (const s of styles) {
    if (!cells.some((c2) => c2.ground === g && c2.heroes.length === 1 && c2.cell.level === floor && who(c2) === s && gearOf(c2) === gearTag)) continue;
    console.log('  ' + (s + gearTag).padEnd(22) + xs.map((x) => { const c = cells.find((c2) => c2.ground === g && xOf(c2) === x && c2.heroes.length === 1 && c2.cell.level === floor && who(c2) === s && gearOf(c2) === gearTag); if (!c) return ''; const r = readCell(c); const dips = c.heroes.reduce((s, h) => s + ((h.closeCallsPer12h && h.closeCallsPer12h.k) || 0), 0); return x + ' ' + pct(r.margin) + ' ' + r.hp + '%' + (dips ? ' ' + dips + ' dips' : '') + (r.deaths ? ' ' + r.deaths + 'd' : ''); }).join(' | '));
  }
}
