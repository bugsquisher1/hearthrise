#!/usr/bin/env node
// tools/balance-sim/sheet-check.mjs — GRADE A GROUND AGAINST THE TARGET SHEET (src/data/balance-sheet.js BALANCE_SHEET;
// lane/b-ground-formula). Reads a run of plan 'formula' (tools/balance-sim/plans.mjs) and answers, per ground and row set
// (x = T today, F the formula), every line of the sheet with its measured value and PASS or FAIL. Exit 1 when the graded
// row set misses a line, so a ground that drifts off the sheet goes red.
//
//   node tools/balance-sim/sim.mjs --plan formula --out tools/balance-sim/out/formula
//   node tools/balance-sim/sheet-check.mjs [--in DIR] [--rows F] [--grounds a,b] [--table]   grade (exit 1 on a FAIL)
//   node tools/balance-sim/sheet-check.mjs --selftest [--in DIR]                              the mutants it must catch
//
// Every number is read off the cells (cell.mjs metrics); the only arithmetic is pooling per head, medians and ratios.
// A death rate the sample can't bound (2 seeds x 2 h a way is about 32 h at the floor) is graded on the sample's own
// count: no death at the floor reads PASS and names its 95% bound; the 1-in-1,000 h line needs the deep runs.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCell } from './tiers-table.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const { BALANCE_SHEET: S, contractXpPerH } = await import(pathToFileURL(join(ROOT, 'src/data/balance-sheet.js')).href);
const PACE = JSON.parse(readFileSync(join(HERE, 'level-pace.json'), 'utf8'));
export const SHAPE = Object.freeze({ wickstead: { floor: 8, mid: 13, top: 18, firstDay: true }, mosslight_glade: { floor: 16, mid: 24, top: 31, firstDay: false } });

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const who = (c) => c.heroes.map((h) => h.style).join('+');
const starter = (c) => !!(c.cell.gear && c.cell.gear.starter);
const k = (n) => (!Number.isFinite(n) ? '-' : Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(n)));
const signed = (n) => (n >= 0 ? '+' : '') + k(n);
const pct = (x) => (x == null || !Number.isFinite(x) ? '-' : Math.round(x * 100) + '%');
export const load = (dir) => (existsSync(join(dir, 'cells.jsonl')) ? [...new Map(readFileSync(join(dir, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.heroes).map((r) => [r.id, r])).values()] : []);

/** The cells of one ground, row set and tier, by a predicate. */
const pick = (cells, g, rows, tier) => (pred) => cells.filter((c) => c.ground === g && c.cell.x === rows + tier && pred(c));
const closeOf = (c) => c.heroes.reduce((s, h) => s + ((h.closeCallsPer12h && h.closeCallsPer12h.k) || 0), 0);

/**
 * Grade ground `g`, row set `rows` ('T' | 'F'), against BALANCE_SHEET. Answers { lines: [{ id, what, value, target, pass }], facts }.
 * A line with no cells reads pass: null (not graded), never a pass.
 */
export function gradeGround(cells, g, rows) {
  const sh = SHAPE[g], lines = [], facts = {};
  const line = (id, what, value, target, pass) => lines.push({ id, what, value, target, pass });
  const N = pick(cells, g, rows, 'normal');
  const lone = (cs) => cs.filter((c) => c.heroes.length === 1);
  /* NORMAL at the floor, 8 ways, that Level's gear */
  const floor = lone(N((c) => c.cell.level === sh.floor && !starter(c))).map((c) => ({ c, r: readCell(c) }));
  if (floor.length) {
    const deaths = floor.reduce((s, x) => s + x.r.deaths, 0), hours = floor.reduce((s, x) => s + x.r.hours, 0);
    line('normal.deaths', 'Normal, floor alone: deaths (' + floor.length + ' ways)', deaths + ' in ' + Math.round(hours) + ' h', '0 in the sample (<= 1 per 1,000 h)', deaths === 0);
    const worstClose = Math.max(...floor.map((x) => (12 * closeOf(x.c)) / x.r.hours));
    line('normal.close', 'Normal, floor alone: dips under ' + S.normal.closeCallPct + '% per 12 h, worst way', worstClose.toFixed(2), '<= ' + S.normal.closeCallsPer12h, worstClose <= S.normal.closeCallsPer12h);
    const low = Math.min(...floor.map((x) => x.r.hp));
    line('normal.typical', 'Normal, floor alone: typical low point, worst way', low + '%', '>= ' + S.normal.typicalMinHpPct + '%', low >= S.normal.typicalMinHpPct);
    const margins = floor.map((x) => (x.r.margin == null ? Infinity : x.r.margin));
    const worst = Math.min(...margins), wi = margins.indexOf(worst);
    line('normal.margin', 'Normal, floor alone: coin + commons over the bill, worst way', worst === Infinity ? 'no bill' : pct(worst) + ' (' + who(floor[wi].c) + ')', '>= +' + pct(S.normal.marginMin), worst >= S.normal.marginMin);
    const share = median(floor.map((x) => (x.r.income ? x.r.store / x.r.income : 0)));
    const ss = S.normal.supplyShare, needsMin = sh.floor >= ss.fromLevel;
    line('normal.supplies', 'Normal, floor alone: the bill as a share of income, median way', pct(share), (needsMin ? pct(ss.min) + '-' : '<= ') + pct(ss.max), share <= ss.max && (!needsMin || share >= ss.min));
    facts.floorXp = median(floor.map((x) => x.r.xp)); facts.floorNet = median(floor.map((x) => x.r.net));
  }
  const mid = lone(N((c) => c.cell.level === sh.mid && !starter(c))).map((c) => readCell(c));
  if (mid.length) {
    const xp = median(mid.map((r) => r.xp)), want = contractXpPerH(sh.mid), ratio = xp / want;
    line('normal.xp', 'Normal, middle (' + sh.mid + ') alone: Level XP an hour, median way, against the contract ' + k(want), k(xp) + ' (' + ratio.toFixed(2) + 'x)', S.normal.xpVsContract.min + '-' + S.normal.xpVsContract.max + 'x', ratio >= S.normal.xpVsContract.min && ratio <= S.normal.xpVsContract.max);
  }
  /* THE FRESH HERO on a first-day ground */
  if (sh.firstDay && sh.floor <= S.freshHero.upToLevel) {
    const fr = lone(N((c) => c.cell.level === sh.floor && starter(c))).map((c) => ({ c, r: readCell(c) }));
    if (fr.length) {
      const deaths = fr.reduce((s, x) => s + x.r.deaths, 0), close = fr.reduce((s, x) => s + closeOf(x.c), 0);
      const low = Math.min(...fr.map((x) => x.r.hp)), worst = Math.min(...fr.map((x) => (x.r.margin == null ? Infinity : x.r.margin)));
      const pace = PACE.rate[String(sh.floor)], xpMin = Math.min(...fr.map((x) => x.r.xp));
      line('fresh.safe', 'Fresh hero (practice set), floor: deaths / dips under 25% / typical low, worst way', deaths + ' / ' + close + ' / ' + low + '%', '0 / 0 / >= ' + S.freshHero.typicalMinHpPct + '%', deaths <= S.freshHero.deaths && close <= S.freshHero.closeCalls && low >= S.freshHero.typicalMinHpPct);
      line('fresh.paid', 'Fresh hero, floor: worst margin / slowest XP against the pace of record', (worst === Infinity ? 'no bill' : pct(worst)) + ' / ' + (xpMin / pace).toFixed(2) + 'x', '>= +' + pct(S.freshHero.marginMin) + ' / >= ' + S.freshHero.xpVsPaceMin + 'x', worst >= S.freshHero.marginMin && xpMin / pace >= S.freshHero.xpVsPaceMin);
    }
  }
  /* PARTY: a four at the floor, per head, against the median way alone at the floor */
  const four = N((c) => c.heroes.length === 4 && c.cell.level === sh.floor)[0];
  if (four && facts.floorXp) {
    const r = readCell(four), ratio = r.xp / facts.floorXp;
    line('party.four', 'Normal, a four at the floor: Level XP a head against the median way alone', k(r.xp) + ' (' + ratio.toFixed(2) + 'x)', S.party.fourVsSolo.join('-') + 'x', ratio >= S.party.fourVsSolo[0] && ratio <= S.party.fourVsSolo[1]);
    facts.fourXp = r.xp;
  }
  /* THE HARDER TIERS AT THE RIGHT LEVEL */
  for (const tier of ['dangerous', 'deadly']) {
    const T = pick(cells, g, rows, tier);
    const fl = lone(T((c) => c.cell.level === sh.floor && !starter(c))).map((c) => readCell(c));
    if (fl.length && facts.floorXp) {
      const xp = median(fl.map((r) => r.xp)), held = fl.filter((r) => r.deaths === 0).length, net = median(fl.map((r) => r.net));
      if (tier === 'dangerous') line('dangerous.lone', 'Dangerous, floor alone: Level XP against Normal (median) / ways that held', (xp / facts.floorXp).toFixed(2) + 'x / ' + held + ' of ' + fl.length, '>= ' + S.tiers.dangerous.xpVsNormalMin + 'x / >= ' + S.tiers.dangerous.loneHeldMin, xp / facts.floorXp >= S.tiers.dangerous.xpVsNormalMin && held >= S.tiers.dangerous.loneHeldMin);
      else line('deadly.lone', 'Deadly, floor alone: the median way pays for it (dies, or nets less than on Normal)', held + ' of ' + fl.length + ' held, net ' + signed(net) + ' (Normal ' + signed(facts.floorNet) + ')', 'a death, or net under Normal', held < fl.length / 2 || net < facts.floorNet);
    }
    const f4 = T((c) => c.heroes.length === 4 && c.cell.level === sh.floor)[0];
    if (tier === 'deadly' && f4 && facts.fourXp) {
      const r = readCell(f4), per16 = (16 * r.deaths) / r.hours;
      line('deadly.four', 'Deadly, a four at the floor: Level XP a head against its Normal / deaths per 16 hero-hours', (r.xp / facts.fourXp).toFixed(2) + 'x / ' + per16.toFixed(1), '>= ' + S.tiers.deadly.fourXpVsNormalMin + 'x / <= ' + S.tiers.deadly.fourDeathsPer16hMax, r.xp / facts.fourXp >= S.tiers.deadly.fourXpVsNormalMin && per16 <= S.tiers.deadly.fourDeathsPer16hMax);
    }
    /* OUTSIDE THE WEIGHT CLASS */
    const pairs = T((c) => c.heroes.length === 2 && c.cell.level >= sh.floor - 3 && c.cell.level <= sh.floor - 2).map((c) => readCell(c));
    if (pairs.length && tier === 'dangerous') { const worst = Math.max(...pairs.map((r) => r.net)); line('weight.dangerous', 'Dangerous, pairs 2-3 under: net a head, best pair', signed(worst), '< 0', worst < S.weightClass.dangerousUnder.netMax); }
    if (pairs.length && tier === 'deadly') { const d = Math.min(...pairs.map((r) => r.deaths)), n = Math.max(...pairs.map((r) => r.net)); line('weight.deadly', 'Deadly, pairs 2-3 under: deaths (fewest) / net a head (best)', d + ' / ' + signed(n), '>= 1 / < 0', d >= S.weightClass.deadlyUnder.deathsMin && n < S.weightClass.deadlyUnder.netMax); }
    const five = T((c) => c.cell.level === sh.floor - 5).map((c) => readCell(c));
    if (five.length) { const d = Math.min(...five.map((r) => r.deaths)), n = Math.max(...five.map((r) => r.net)); line('weight.five.' + tier, tier[0].toUpperCase() + tier.slice(1) + ', 5 under (pairs and alone): deaths (fewest) / net (best)', d + ' / ' + signed(n), '>= 1 / < 0', d >= S.weightClass.deadlyUnder.deathsMin && n < S.weightClass.deadlyUnder.netMax); }
  }
  const pairsN = N((c) => c.heroes.length === 2 && c.cell.level >= sh.floor - 3 && c.cell.level <= sh.floor - 2).map((c) => readCell(c));
  if (pairsN.length && facts.floorXp) { const lo = Math.min(...pairsN.map((r) => r.xp)); line('weight.normal', 'Normal, pairs 2-3 under: Level XP a head (slowest) against the floor hero', (lo / facts.floorXp).toFixed(2) + 'x, net ' + pairsN.map((r) => signed(r.net)).join(' / '), '>= ' + S.weightClass.normalUnder.xpVsFloorMin + 'x', lo / facts.floorXp >= S.weightClass.normalUnder.xpVsFloorMin); }
  return { lines, facts };
}

function main() {
  const arg = (k2, d) => { const i = process.argv.indexOf('--' + k2); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
  const cells = load(resolve(arg('in', join(HERE, 'out', 'formula'))));
  if (process.argv.includes('--selftest')) return selftest(cells);
  const graded = arg('rows', 'F'), grounds = arg('grounds', Object.keys(SHAPE).join(',')).split(',');
  let fails = 0;
  for (const g of grounds) {
    const by = Object.fromEntries(['T', 'F'].map((x) => [x, gradeGround(cells, g, x).lines]));
    console.log('\n' + g + ' (graded: ' + graded + ')\n| Line | Today (T) | Formula (F) | Target |\n|---|---|---|---|');
    for (const l of by[graded]) {
      const other = by[graded === 'F' ? 'T' : 'F'].find((x) => x.id === l.id);
      const mark = (x) => (x ? x.value + (x.pass === true ? '' : x.pass === false ? ' **FAIL**' : '') : '-');
      const [t, f] = graded === 'F' ? [other, l] : [l, other];
      console.log('| ' + l.what + ' | ' + mark(t) + ' | ' + mark(f) + ' | ' + l.target + ' |');
      if (l.pass === false) fails++;
    }
  }
  if (fails) { console.error('\nsheet-check: RED, ' + fails + ' line(s) off the sheet for row set ' + graded); process.exitCode = 1; }
  else console.log('\nsheet-check: green, row set ' + graded + ' meets every sheet line it was played on');
}

/* THE MUTANTS: a run's own cells, one line pushed off the sheet at a time; each must turn that line red. */
function selftest(cells) {
  const bad = [];
  const g = Object.keys(SHAPE).find((x) => cells.some((c) => c.ground === x && c.cell.x === 'Fnormal'));
  if (!g) { console.error('sheet-check --selftest: no plan formula run to mutate (run the plan first)'); process.exit(1); }
  const sh = SHAPE[g], clone = () => JSON.parse(JSON.stringify(cells));
  const floorCell = (cs) => cs.find((c) => c.ground === g && c.cell.x === 'Fnormal' && c.heroes.length === 1 && c.cell.level === sh.floor && !starter(c));
  const red = (name, id, mutate) => { const cs = clone(); mutate(cs); const l = gradeGround(cs, g, 'F').lines.find((x) => x.id === id); if (!l || l.pass !== false) bad.push(name + ' was not caught (' + id + ')'); };
  red('a death at the floor on Normal', 'normal.deaths', (cs) => { floorCell(cs).heroes[0].deaths = 1; });
  red('a floor hero dipping under 25% twice in two hours', 'normal.close', (cs) => { const h = floorCell(cs).heroes[0]; h.closeCallsPer12h = { ...(h.closeCallsPer12h || {}), k: 2 * Math.ceil(h.hours) }; });
  red('a floor hero whose typical encounter falls to 40%', 'normal.typical', (cs) => { floorCell(cs).heroes[0].encMinHpPct.p50 = 40; });
  red('a floor bill eating the income', 'normal.margin', (cs) => { const h = floorCell(cs).heroes[0]; h.storePerH = h.incomePerH; });
  red('every floor bill at 90% of income', 'normal.supplies', (cs) => { for (const c of cs) if (c.ground === g && c.cell.x === 'Fnormal' && c.heroes.length === 1 && c.cell.level === sh.floor && !starter(c)) c.heroes[0].storePerH = Math.round(c.heroes[0].incomePerH * 0.9); });
  red('the middle paying half its XP', 'normal.xp', (cs) => { for (const c of cs) if (c.ground === g && c.cell.x === 'Fnormal' && c.heroes.length === 1 && c.cell.level === sh.mid) c.heroes[0].levelXpPerH = Math.round(c.heroes[0].levelXpPerH / 2); });
  if (bad.length) { console.error('sheet-check --selftest: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('sheet-check --selftest: green (6 mutants on ' + g + ', each caught by its line)');
}

if (isMain(import.meta.url)) main();
