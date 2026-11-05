#!/usr/bin/env node
// tools/balance-sim/tiers-table.mjs — lane/c-difficulty-tiers' TABLES, read off the engine's cells.
//
//   node tools/balance-sim/sim.mjs --plan tierpull --workers 3 --out tools/balance-sim/out/tierpull
//   node tools/balance-sim/tiers-table.mjs --pull tools/balance-sim/out/tierpull      what each pull pays each way to fight, and what one fixed pull costs it
//
// Every number is read off the cells; the only arithmetic here is pooling (hours-weighted) and ratios.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { round } from './stats.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const SHORT = { mill_cellar: 'Cellar', meadowbrook_thicket: 'Thicket', wickstead: 'Wickstead', millrace_sewer: 'Sewer', mosslight_glade: 'Glade', coppercap_warrens: 'Warrens' };
const load = (dir) => readFileSync(resolve(dir, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.heroes);

/** One cell's heroes pooled per head. */
export function readCell(c) {
  const hs = c.heroes, hours = hs.reduce((s, h) => s + h.hours, 0);
  const w = (f) => hs.reduce((s, h) => s + (f(h) || 0) * h.hours, 0) / (hours || 1);
  const deaths = hs.reduce((s, h) => s + h.deaths, 0);
  const inc = w((h) => h.incomePerH), store = w((h) => h.storePerH);
  return { xp: round(w((h) => h.levelXpPerH), 0), net: round(w((h) => h.profitPerH), 0), income: round(inc, 0), store: round(store, 0), rares: round(w((h) => h.raresPerH), 0),
    margin: store > 0 ? round(inc / store - 1, 2) : null, kills: c.party.killsPerH, deaths, hours: round(hours, 1), hPerDeath: deaths ? round(hours / deaths, 2) : null,
    hp: Math.min(...hs.map((h) => h.encMinHpPct.p50 ?? 100)), hp10: Math.min(...hs.map((h) => h.encMinHpPct.p10 ?? 100)) };
}
const k = (n) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
const signed = (n) => (n >= 0 ? '+' : '') + k(n);
const life = (r) => (r.deaths === 0 ? 'held' : r.hPerDeath < 1 ? Math.round(r.hPerDeath * 60) + ' min' : r.hPerDeath + ' h');
const whoOf = (c) => (c.cell.party.length > 1 ? c.cell.party.join('+') : c.cell.party[0]);
const dens = (c) => (Number.isInteger(c.cell.density) ? c.cell.density : 0);

/* --cand DIR [--normal DIR] [--only REGEX]: every candidate beside Normal (the default pull of plan tierpull), one row per ground, Level and way to fight. Same reading as --pull. */
const candDir = arg('cand', null);
if (candDir) {
  const cells = load(candDir).concat(arg('normal', null) ? load(arg('normal')).filter((c) => dens(c) === 0).map((c) => ({ ...c, cell: { ...c.cell, x: 'Normal' } })) : []);
  const xs = [...new Set(cells.map((c) => c.cell.x))].sort((a, b) => (a === 'Normal' ? -1 : b === 'Normal' ? 1 : a.localeCompare(b)));
  const filter = arg('only', null);
  const shown = filter ? xs.filter((x) => x === 'Normal' || new RegExp(filter).test(x)) : xs;
  const rows = new Map();
  for (const c of cells) {
    const key = [c.ground, c.cell.level, whoOf(c)].join('|');
    if (!rows.has(key)) rows.set(key, { ground: c.ground, level: c.cell.level, who: whoOf(c), size: c.cell.party.length, by: {} });
    rows.get(key).by[c.cell.x] = readCell(c);
  }
  const list = [...rows.values()].sort((a, b) => a.ground.localeCompare(b.ground) * -1 || a.level - b.level || a.size - b.size || a.who.localeCompare(b.who));
  console.log('Per head per hour: XP, net gold, typical low HP, hours per death (held = none in the cell)\n');
  console.log('| Ground | L | Who | ' + shown.join(' | ') + ' |\n|---|---|---|' + shown.map(() => '---').join('|') + '|');
  for (const r of list) console.log('| ' + (SHORT[r.ground] || r.ground) + ' | ' + r.level + ' | ' + r.who + ' | ' + shown.map((x) => { const c = r.by[x]; return c ? k(c.xp) + ', ' + signed(c.net) + ', ' + Math.round(c.hp) + '%, ' + life(c) : '-'; }).join(' | ') + ' |');
}

/* --ladder DIR: plan tierladder. At the Level that fits the upper ground: the lower ground's Normal and Deadly against the upper's Normal, per head. A rung holds when the lower Deadly doesn't beat the upper Normal on XP. */
const ladDir = arg('ladder', null);
if (ladDir) {
  const cells = load(ladDir);
  const RUNGS = [['mill_cellar', 'meadowbrook_thicket', [5, 8]], ['meadowbrook_thicket', 'wickstead', [8, 12]], ['meadowbrook_thicket', 'millrace_sewer', [8, 12]], ['wickstead', 'mosslight_glade', [16, 20]], ['millrace_sewer', 'mosslight_glade', [16, 20]], ['mosslight_glade', 'coppercap_warrens', [32, 38]]];
  const at = (ground, level, who, x) => { const c = cells.find((y) => y.ground === ground && y.cell.level === level && whoOf(y) === who && y.cell.x === x); return c ? readCell(c) : null; };
  const say = (c) => (c ? k(c.xp) + ', ' + signed(c.net) + ', ' + Math.round(c.hp) + '%, ' + life(c) : '-');
  let beats = 0, total = 0;
  console.log('| Rung | L | Who | Lower Normal | Lower Dangerous | Lower Deadly | Upper Normal | Deadly XP / upper XP |\n|---|---|---|---|---|---|---|---|');
  for (const [lower, upper, levels] of RUNGS) for (const level of levels) {
    const whos = [...new Set(cells.filter((c) => c.ground === lower && c.cell.level === level).map(whoOf))];
    for (const who of whos) {
      const a = at(lower, level, who, 'Lnormal'), d = at(lower, level, who, 'Ldangerous'), x = at(lower, level, who, 'Ldeadly'), u = at(upper, level, who, 'Lnormal');
      const ratio = x && u && u.xp ? round(x.xp / u.xp, 2) : null;
      if (ratio !== null) { total++; if (ratio > 1) beats++; }
      console.log('| ' + SHORT[lower] + ' to ' + SHORT[upper] + ' | ' + level + ' | ' + who + ' | ' + say(a) + ' | ' + say(d) + ' | ' + say(x) + ' | ' + say(u) + ' | ' + ratio + (ratio > 1 ? ' **beats**' : '') + ' |');
    }
  }
  console.log('\n' + beats + ' of ' + total + ' cells: the lower Deadly beats the upper Normal on XP');
}

/* --final DIR: plan tierfinal, one row per ground, Level and who, each tier beside Normal. */
const finalDir = arg('final', null);
if (finalDir) {
  const rows = new Map();
  for (const c of load(finalDir)) {
    const key = [c.ground, c.cell.level, whoOf(c)].join('|');
    if (!rows.has(key)) rows.set(key, { ground: c.ground, level: c.cell.level, who: whoOf(c), size: c.cell.party.length });
    rows.get(key)[c.cell.x] = readCell(c);
  }
  const say = (c) => (c ? k(c.xp) + ', ' + signed(c.net) + ', ' + Math.round(c.hp) + '%, ' + life(c) : '-');
  const list = [...rows.values()].sort((a, b) => a.ground.localeCompare(b.ground) * -1 || a.level - b.level || a.size - b.size || a.who.localeCompare(b.who));
  console.log('| Ground | L | Who | Normal | Dangerous | Deadly |\n|---|---|---|---|---|---|');
  for (const r of list) console.log('| ' + SHORT[r.ground] + ' | ' + r.level + ' | ' + r.who + ' | ' + say(r.Fnormal) + ' | ' + say(r.Fdangerous) + ' | ' + say(r.Fdeadly) + ' |');
  /* Income and rares an hour: the same per kill, so they move only with kills an hour. */
  console.log('\nIncome and rare value per head per hour, kills per hour (party): Normal / Dangerous / Deadly\n');
  console.log('| Ground | L | Who | Income | Rares | Kills/h | Store bill |\n|---|---|---|---|---|---|---|');
  for (const r of list) {
    const tri = (f) => [r.Fnormal, r.Fdangerous, r.Fdeadly].map((c) => (c ? k(f(c)) : '-')).join(' / ');
    console.log('| ' + SHORT[r.ground] + ' | ' + r.level + ' | ' + r.who + ' | ' + tri((c) => c.income) + ' | ' + tri((c) => c.rares) + ' | ' + tri((c) => c.kills) + ' | ' + tri((c) => c.store) + ' |');
  }
}

/* --static PULLDIR,FINALDIR: WHAT THE FIXED PULL COSTS. Each way to fight's best reading today over every pull (most XP/h that nets above zero with no death), against its best of the three tiers by the same test. */
const staticDirs = arg('static', null);
if (staticDirs) {
  const [pd, fd] = staticDirs.split(',');
  const fine = (r) => r && r.net > 0 && r.deaths === 0;
  const best = (list) => { const ok = list.filter((x) => fine(x.r)); return ok.length ? ok.reduce((a, b) => (b.r.xp > a.r.xp ? b : a)) : null; };
  const today = new Map(), tiers = new Map();
  const add = (m, c, name) => { const key = [c.ground, c.cell.level, whoOf(c)].join('|'); if (!m.has(key)) m.set(key, []); m.get(key).push({ name, r: readCell(c) }); };
  for (const c of load(pd)) add(today, c, dens(c) ? 'pull ' + dens(c) : 'as it stands');
  for (const c of load(fd)) add(tiers, c, c.cell.x.slice(1));
  const rows = [...today.keys()].filter((key) => tiers.has(key)).map((key) => { const [ground, level, who] = key.split('|'); return { ground, level: Number(level), who, a: best(today.get(key)), b: best(tiers.get(key)) }; })
    .sort((x, y) => x.ground.localeCompare(y.ground) * -1 || x.level - y.level || x.who.length - y.who.length || x.who.localeCompare(y.who));
  console.log('| Ground | L | Who | Best today, any pull | Best tier | XP against today |\n|---|---|---|---|---|---|');
  const ratios = [];
  for (const r of rows) {
    const ratio = r.a && r.b ? r.b.r.xp / r.a.r.xp : null;
    if (ratio !== null) ratios.push({ ...r, ratio });
    const say = (x) => (x ? x.name + ': ' + k(x.r.xp) + ', ' + signed(x.r.net) + ', ' + Math.round(x.r.hp) + '%' : 'none');
    console.log('| ' + SHORT[r.ground] + ' | ' + r.level + ' | ' + r.who + ' | ' + say(r.a) + ' | ' + say(r.b) + ' | ' + (ratio === null ? '-' : Math.round(ratio * 100) + '%') + ' |');
  }
  ratios.sort((a, b) => a.ratio - b.ratio);
  console.log('\nLowest: ' + ratios.slice(0, 6).map((r) => SHORT[r.ground] + ' ' + r.level + ' ' + r.who + ' ' + Math.round(r.ratio * 100) + '%').join(', '));
  console.log('Median: ' + Math.round(ratios[ratios.length >> 1].ratio * 100) + '% over ' + ratios.length + ' cells; ' + rows.filter((r) => r.a && !r.b).length + ' cells have a good pull today and no good tier; ' + rows.filter((r) => !r.a && r.b).length + ' the other way');
}

const pullDir = arg('pull', null);
if (pullDir) {
  const cells = load(pullDir);
  const rows = new Map();
  for (const c of cells) {
    const key = [c.ground, c.cell.level, whoOf(c)].join('|');
    if (!rows.has(key)) rows.set(key, { ground: c.ground, level: c.cell.level, who: whoOf(c), size: c.cell.party.length, byPull: {} });
    rows.get(key).byPull[dens(c)] = readCell(c);
  }
  const PULLS = [0, 4, 5, 6, 8];
  const list = [...rows.values()].sort((a, b) => a.ground.localeCompare(b.ground) * -1 || a.level - b.level || a.size - b.size || a.who.localeCompare(b.who));
  console.log('Per head per hour: XP, net gold, typical low HP, hours per death (held = none in the cell)\n');
  console.log('| Ground | L | Who | ' + PULLS.map((p) => (p ? 'Pull ' + p : 'Default')).join(' | ') + ' |\n|---|---|---|' + PULLS.map(() => '---').join('|') + '|');
  for (const r of list) {
    console.log('| ' + (SHORT[r.ground] || r.ground) + ' | ' + r.level + ' | ' + r.who + ' | ' + PULLS.map((p) => {
      const c = r.byPull[p];
      return c ? k(c.xp) + ', ' + signed(c.net) + ', ' + Math.round(c.hp) + '%, ' + life(c) : '-';
    }).join(' | ') + ' |');
  }
  /* WHAT A FIXED PULL COSTS: each way to fight's best pull (most XP that nets above zero and held), against what it reads at each pull. */
  const fine = (c) => c && c.net > 0 && c.deaths === 0;
  console.log('\nBest pull per way to fight (most XP/h that still nets above zero with no death); each pull as a share of that XP/h, "x" = dies or loses money\n');
  console.log('| Ground | L | Who | Best | Best XP/h | ' + PULLS.map((p) => (p ? String(p) : 'Default')).join(' | ') + ' |\n|---|---|---|---|---|' + PULLS.map(() => '---').join('|') + '|');
  for (const r of list) {
    const ok = PULLS.filter((p) => fine(r.byPull[p]));
    const best = ok.length ? ok.reduce((a, b) => (r.byPull[b].xp > r.byPull[a].xp ? b : a)) : null;
    const B = best === null ? null : r.byPull[best];
    console.log('| ' + (SHORT[r.ground] || r.ground) + ' | ' + r.level + ' | ' + r.who + ' | ' + (best === null ? 'none' : best === 0 ? 'Default' : best) + ' | ' + (B ? k(B.xp) : '-') + ' | '
      + PULLS.map((p) => { const c = r.byPull[p]; return !c ? '-' : (B ? Math.round((c.xp / B.xp) * 100) + '%' : k(c.xp)) + (fine(c) ? '' : ' x'); }).join(' | ') + ' |');
  }
}
