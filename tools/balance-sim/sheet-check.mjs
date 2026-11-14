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
const G = await import(pathToFileURL(join(ROOT, 'src/data/hunt-grounds.js')).href);
const { HUNT_INDEX } = await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href);
/* every open ground's shape, from its band and fit (plans.mjs plays them the same way): a party ground is graded on its four's seats */
export const SHAPE = Object.freeze(Object.fromEntries(Object.values(G.OPEN_GROUNDS).map((g) => { const b = HUNT_INDEX[g.hunt].band;
  return [g.id, { floor: b[0], mid: Math.round((b[0] + b[1]) / 2), top: b[1], party: g.pockets.some((p) => p.forParty) || g.groupFit === 'party', firstDay: b[0] <= 15 }]; })));
const seats = (c) => c.heroes.map((h) => ({ ...c, heroes: [h] }));

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const who = (c) => c.heroes.map((h) => h.style).join('+');
const starter = (c) => !!(c.cell.gear && c.cell.gear.starter);
const k = (n) => (!Number.isFinite(n) ? '-' : Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(n)));
const signed = (n) => (n >= 0 ? '+' : '') + k(n);
const pct = (x) => (x == null || !Number.isFinite(x) ? '-' : Math.round(x * 100) + '%');
const TIER_WORD = { dangerous: 'Dangerous', deadly: 'Deadly' };
/* NO PROFIT MOLDS (Tyler 2026-11-13): a gold line's target reads this and its pass is null (printed, never graded). The sheet's old gold
   fields (normal.marginMin, normal.supplyShare, freshHero.marginMin, weightClass.*.netMax) are not read. */
const GOLD = 'printed, not graded';
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
  /* the ways a ground is judged by: alone, the 8 ways; a party ground, its four's four seats */
  const lone = (cs) => (sh.party ? cs.filter((c) => c.heroes.length === 4).flatMap(seats) : cs.filter((c) => c.heroes.length === 1));
  const by = sh.party ? 'a four at the' : 'alone at the';
  /* NORMAL at the floor, 8 ways, that Level's gear */
  const floor = lone(N((c) => c.cell.level === sh.floor && !starter(c))).map((c) => ({ c, r: readCell(c) }));
  if (floor.length) {
    const deaths = floor.reduce((s, x) => s + x.r.deaths, 0), hours = floor.reduce((s, x) => s + x.r.hours, 0);
    line('normal.deaths', 'Normal, ' + by + ' floor: deaths (' + floor.length + ' ways)', deaths + ' in ' + Math.round(hours) + ' h', '0 in the sample (<= 1 per 1,000 h)', deaths === 0);
    const dips = floor.reduce((s, x) => s + closeOf(x.c), 0), pooled = (12 * dips) / hours;
    const worstWay = floor.map((x) => [closeOf(x.c), who(x.c)]).sort((a, b) => b[0] - a[0])[0];
    line('normal.close', 'Normal, ' + by + ' floor: dips under ' + S.normal.closeCallPct + '% per 12 h, the 8 ways pooled (most in one way)', pooled.toFixed(2) + ' (' + dips + ' in ' + Math.round(hours) + ' h; ' + worstWay[1] + ' ' + worstWay[0] + ')', '<= ' + S.normal.closeCallsPer12h, pooled <= S.normal.closeCallsPer12h);
    const low = Math.min(...floor.map((x) => x.r.hp));
    line('normal.typical', 'Normal, ' + by + ' floor: typical low point, worst way', low + '%', '>= ' + S.normal.typicalMinHpPct + '%', low >= S.normal.typicalMinHpPct);
    /* NO PROFIT MOLDS (Tyler 2026-11-13): gold is a printed line (pass null), never graded. The +25% floor and the supplies share are retired. */
    const margins = floor.map((x) => (x.r.margin == null ? Infinity : x.r.margin));
    const worst = Math.min(...margins), wi = margins.indexOf(worst);
    const share = median(floor.map((x) => (x.r.income ? x.r.store / x.r.income : 0)));
    line('normal.gold', 'Normal, ' + by + ' floor: coin + commons over the bill, worst way / the bill as a share of income, median way', (worst === Infinity ? 'no bill' : pct(worst) + ' (' + who(floor[wi].c) + ')') + ' / ' + pct(share), GOLD, null);
    facts.floorXp = median(floor.map((x) => x.r.xp)); facts.floorNet = median(floor.map((x) => x.r.net));
    if (sh.party) facts.fourXp = facts.floorXp;
  }
  const mid = lone(N((c) => c.cell.level === sh.mid && !starter(c))).map((c) => readCell(c));
  if (mid.length) {
    const xp = median(mid.map((r) => r.xp)), want = contractXpPerH(sh.mid), ratio = xp / want;
    line('normal.xp', 'Normal, middle (' + sh.mid + ') alone: Level XP an hour, median way, against the contract ' + k(want), k(xp) + ' (' + ratio.toFixed(2) + 'x)', S.normal.xpVsContract.min + '-' + S.normal.xpVsContract.max + 'x', ratio >= S.normal.xpVsContract.min && ratio <= S.normal.xpVsContract.max);
  }
  /* THE FRESH HERO on a first-day ground */
  if (sh.firstDay && sh.floor <= S.freshHero.upToLevel) {
    const fr = N((c) => c.cell.level === sh.floor && starter(c)).flatMap(seats).map((c) => ({ c, r: readCell(c) }));
    if (fr.length) {
      const deaths = fr.reduce((s, x) => s + x.r.deaths, 0), close = fr.reduce((s, x) => s + closeOf(x.c), 0);
      const low = Math.min(...fr.map((x) => x.r.hp)), worst = Math.min(...fr.map((x) => (x.r.margin == null ? Infinity : x.r.margin)));
      const pace = PACE.rate[String(sh.floor)], xpMin = Math.min(...fr.map((x) => x.r.xp));
      line('fresh.safe', 'Fresh hero (practice set), floor: deaths / dips under 25% / typical low, worst way', deaths + ' / ' + close + ' / ' + low + '%', '0 / 0 / >= ' + S.freshHero.typicalMinHpPct + '%', deaths <= S.freshHero.deaths && close <= S.freshHero.closeCalls && low >= S.freshHero.typicalMinHpPct);
      line('fresh.pace', 'Fresh hero, floor: slowest XP against the pace of record', (xpMin / pace).toFixed(2) + 'x', '>= ' + S.freshHero.xpVsPaceMin + 'x', xpMin / pace >= S.freshHero.xpVsPaceMin);
      line('fresh.gold', 'Fresh hero, floor: worst margin over the bill', worst === Infinity ? 'no bill' : pct(worst), GOLD, null);
    }
  }
  /* PARTY: a four at the floor, per head, against the median way alone at the floor */
  const four = sh.party ? null : N((c) => c.heroes.length === 4 && c.cell.level === sh.floor)[0];
  if (four && facts.floorXp) {
    const r = readCell(four), ratio = r.xp / facts.floorXp;
    line('party.four', 'Normal, a four at the floor: Level XP a head against the median way alone', k(r.xp) + ' (' + ratio.toFixed(2) + 'x)', S.party.fourVsSolo.join('-') + 'x', ratio >= S.party.fourVsSolo[0] && ratio <= S.party.fourVsSolo[1]);
    facts.fourXp = r.xp;
  }
  /* THE HARDER TIERS AT THE RIGHT LEVEL: one difficulty for every group (RULED 2026-11-08), so the lines read what the tier pays whoever
     held it (the lone ways that held, the median), and what a lone hero there fared is a report line, never a target */
  for (const tier of ['dangerous', 'deadly']) {
    const T = pick(cells, g, rows, tier);
    const fl = lone(T((c) => c.cell.level === sh.floor && !starter(c))).map((c) => readCell(c));
    const want = S.tiers[tier].xpVsNormalMin;
    if (fl.length && facts.floorXp) {
      const heldXp = fl.filter((r) => r.deaths === 0).map((r) => r.xp), held = heldXp.length, net = median(fl.map((r) => r.net));
      const xp = held ? median(heldXp) : null;
      line(tier + '.held', TIER_WORD[tier] + ', ' + by + ' floor: Level XP of the ways that held, against Normal (median) / ways that held / net (report)', (xp ? (xp / facts.floorXp).toFixed(2) + 'x' : 'none held') + ' / ' + held + ' of ' + fl.length + ' / ' + signed(net), '>= ' + want + 'x', !xp || xp / facts.floorXp >= want);
    }
    const f4 = T((c) => c.heroes.length === 4 && c.cell.level === sh.floor && !starter(c))[0];
    if (tier === 'deadly' && f4 && facts.fourXp) {
      const r = readCell(f4), per16 = (16 * r.deaths) / r.hours;
      line('deadly.four', 'Deadly, a four at the floor: Level XP a head against its Normal / deaths per 16 hero-hours', (r.xp / facts.fourXp).toFixed(2) + 'x / ' + per16.toFixed(1), '>= ' + want + 'x / <= ' + S.tiers.deadly.fourDeathsPer16hMax, r.xp / facts.fourXp >= want && per16 <= S.tiers.deadly.fourDeathsPer16hMax);
    }
    /* OUTSIDE THE WEIGHT CLASS */
    const pairs = T((c) => c.heroes.length === 2 && c.cell.level >= sh.floor - 3 && c.cell.level <= sh.floor - 2).map((c) => readCell(c));
    const span = (rs, k2) => { const v = rs.map((r) => r[k2]).sort((a, b) => a - b); return v.length > 1 ? v[0] + ' to ' + v[v.length - 1] : String(v[0]); };
    const spanG = (rs) => { const v = rs.map((r) => r.net).sort((a, b) => a - b); return signed(v[0]) + (v.length > 1 ? ' to ' + signed(v[v.length - 1]) : ''); };
    /* the under-the-floor-loses-gold lines are RETIRED (NO PROFIT MOLDS, Tyler 2026-11-13): each net is printed (pass null), the deaths still read */
    if (pairs.length && tier === 'dangerous') { const n = median(pairs.map((r) => r.net)); line('weight.dangerous', 'Dangerous, pairs 2-3 under: net a head, median pair (range)', signed(n) + ' (' + spanG(pairs) + ')', GOLD, null); }
    if (pairs.length && tier === 'deadly') { const d = median(pairs.map((r) => r.deaths)), n = median(pairs.map((r) => r.net)); line('weight.deadly', 'Deadly, pairs 2-3 under: deaths, median pair (range) / net a head (printed)', d + ' (' + span(pairs, 'deaths') + ') / ' + signed(n) + ' (' + spanG(pairs) + ')', '>= 1', d >= S.weightClass.deadlyUnder.deathsMin); }
    const five = T((c) => c.cell.level === sh.floor - 5 && c.cell.level >= 1).map((c) => readCell(c));
    if (five.length) { const d = median(five.map((r) => r.deaths)), n = median(five.map((r) => r.net)), dies = tier === 'deadly';
      line('weight.five.' + tier, tier[0].toUpperCase() + tier.slice(1) + ', 5 under (pairs and alone): deaths, median cell (range) / net (printed)', d + ' (' + span(five, 'deaths') + ') / ' + signed(n) + ' (' + spanG(five) + ')', dies ? '>= 1' : 'any', dies ? d >= S.weightClass.deadlyUnder.deathsMin : null); }
  }
  const pairsN = N((c) => c.heroes.length === 2 && c.cell.level >= sh.floor - 3 && c.cell.level <= sh.floor - 2);
  if (pairsN.length) {
    const ratios = pairsN.map((c) => readCell(c).xp / PACE.rate[String(c.cell.level)]), lo = Math.min(...ratios);
    line('weight.normal', 'Normal, pairs 2-3 under: Level XP a head (slowest) against the pace of record at their own Level', lo.toFixed(2) + 'x, net ' + pairsN.map((c) => signed(readCell(c).net)).join(' / '), '>= ' + S.weightClass.normalUnder.xpVsOwnPaceMin + 'x', lo >= S.weightClass.normalUnder.xpVsOwnPaceMin);
  }
  return { lines, facts };
}

function main() {
  const arg = (k2, d) => { const i = process.argv.indexOf('--' + k2); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
  /* --in A,B: several runs, a later folder's cell wins on a shared id (a re-run of the formula after a dial moved) */
  /* --in A,B: several runs; a later folder REPLACES every row set (T, F, ...) it holds, so a re-run of the formula never mixes with the run before */
  const folders = arg('in', join(HERE, 'out', 'formula')).split(',').map((d) => load(resolve(d)));
  const cells = folders.flatMap((cs, i) => cs.filter((c) => !folders.slice(i + 1).some((later) => later.some((x) => x.cell.x[0] === c.cell.x[0] && x.ground === c.ground))));
  if (process.argv.includes('--selftest')) return selftest(cells);
  const graded = arg('rows', 'F'), grounds = arg('grounds', Object.keys(SHAPE).join(',')).split(',');
  /* the row sets shown beside the graded one: every set the run holds (T today, F the formula, others a candidate) */
  const sets = [...new Set(cells.map((c) => c.cell.x[0]))].sort((a, b) => (a === 'T' ? -1 : b === 'T' ? 1 : a.localeCompare(b)));
  let fails = 0;
  for (const g of grounds) {
    const by = Object.fromEntries(sets.map((x) => [x, gradeGround(cells, g, x).lines]));
    console.log('\n' + g + ' (graded: ' + graded + ')\n| Line | ' + sets.join(' | ') + ' | Target |\n|---|' + sets.map(() => '---').join('|') + '|---|');
    const mark = (x) => (x ? x.value + (x.pass === true ? '' : x.pass === false ? ' **FAIL**' : '') : '-');
    for (const l of by[graded] || []) {
      console.log('| ' + l.what + ' | ' + sets.map((x) => mark(by[x].find((y) => y.id === l.id))).join(' | ') + ' | ' + l.target + ' |');
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
  red('the middle paying half its XP', 'normal.xp', (cs) => { for (const c of cs) if (c.ground === g && c.cell.x === 'Fnormal' && c.heroes.length === 1 && c.cell.level === sh.mid) c.heroes[0].levelXpPerH = Math.round(c.heroes[0].levelXpPerH / 2); });
  /* NO PROFIT MOLDS (Tyler 2026-11-13): a gold-only change (every floor bill eating the income) turns NO line red, and the printed gold line moves */
  const goldOnly = clone();
  for (const c of goldOnly) if (c.ground === g && c.heroes.length === 1 && c.cell.level === sh.floor && !starter(c)) c.heroes[0].storePerH = c.heroes[0].incomePerH;
  const was = gradeGround(cells, g, 'F').lines, now = gradeGround(goldOnly, g, 'F').lines;
  const newRed = now.filter((l) => l.pass === false && !was.some((x) => x.id === l.id && x.pass === false));
  if (newRed.length) bad.push('a gold-only change turned ' + newRed.map((l) => l.id).join(', ') + ' red (gold is printed, never graded)');
  const gl = (ls) => (ls.find((l) => l.id === 'normal.gold') || {}).value;
  if (!gl(now) || gl(now) === gl(was)) bad.push('the printed gold line did not move on a gold-only change (' + gl(was) + ' -> ' + gl(now) + ')');
  if (now.some((l) => l.target === GOLD && l.pass !== null)) bad.push('a printed gold line carries a pass');
  if (bad.length) { console.error('sheet-check --selftest: RED\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('sheet-check --selftest: green (4 mutants on ' + g + ', each caught by its line; a gold-only change turns nothing red and moves the printed gold line)');
}

if (isMain(import.meta.url)) main();
