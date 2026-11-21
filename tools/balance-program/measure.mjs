#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/measure.mjs — THE ONE MEASURING HARNESS OF THE BALANCE PROGRAM.
// Every phase-2 dive runs THESE commands, so a number in one dive can be laid beside a number in another.
// It grades nothing and writes nothing under src/. The model it reads: tools/balance-program/model.mjs
// (words: docs/design/balance-program/01-model.md). It plays the REAL settle through tools/balance-sim/cell.mjs.
//
//   node tools/balance-program/measure.mjs model
//        NO PLAY. The ledgers, stack classes, levers, reference points, seats, players, ages, populations.
//   node tools/balance-program/measure.mjs ref [--at thicket,glade,...] [--hours 1] [--seeds 2] [--write]
//        PLAY. The three reference seats at every reference point: Level XP, main skill XP, gold in, store bill,
//        net gold, kills, damage taken, deaths, an hour a head. --write commits them to tools/balance-program/ref.json
//        (the snapshot `price` reads, stamped with the commit it was measured on).
//   node tools/balance-program/measure.mjs what --at <point> [--seat lone|mage|four] --patch '<json>' [--label "..."] [--hours 1] [--seeds 2]
//   node tools/balance-program/measure.mjs what --at <point> --patch-file <file.json>
//        PLAY, paired dice. The reference cell, then the same cell with the patch merged in (any tools/balance-sim/cell.mjs
//        field: gear {accessories, tierOffset, only, also, uniques, openAlso}, temper, skillsBySeat, options {tier}, density,
//        supply, party, level; `skillBump: N` raises the main skill and Defense N over the career line). Prints the lever
//        as RATIOS TO REF on every ledger the engine answers. A patch file may hold a list [{label, patch}, ...]: the single
//        steps and the last row are then checked for add-or-multiply.
//   node tools/balance-program/measure.mjs price <gold> [--at <point> | --level <L>]
//        NO PLAY (reads ref.json). A gold price in REF HOURS and in days for each reference player.
//   node tools/balance-program/measure.mjs cost [--add statements=0,ledger=0,writes=0,polls=0] [--share 1] [--after]
//        NO PLAY. What a hunting hero costs the server today (tests/per-player-cost.baseline.json) an hour, the system's
//        addition against the allowance, and the totals at 10 / 1,000 / 10,000 online. --share = the share of heroes that use it.
//   node tools/balance-program/measure.mjs curves | deep | stack | fits   [their own flags]
//        Hands over to tools/balance-sim/staged/whole-game-stack.mjs (formulas at Levels 10..400; staged grounds and the Tower).
//
// Exit 0 when it ran, 2 on a bad argument.
//
// IMPORTED, it runs nothing: the balance guard (tests/balance-guard.mjs) builds its cells with refCell, reads them with rowOf and
// prices a reference account with accountCost, so a guard line and a dive's number are the same function.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { isMain } from '../../tests/_is-main.mjs';
import { LEDGERS, STACK_CLASSES, LEVERS, REF_POINTS, FORMULA_ONLY_LEVELS, REF_SEATS, REFERENCE_PLAYERS, REAL_OWN_FOUR_NET, HARNESS_GAPS, SERVER_AGES, POPULATIONS, COST } from './model.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const REF_FILE = join(HERE, 'ref.json');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const mode = process.argv[2];
const bad = (m) => { console.error(m); process.exit(2); };
const x = (a, b) => (b ? (a / b).toFixed(3) : 'n/a');
export const MAIN = Object.freeze({ hammer: 'melee', tank: 'melee', sword: 'melee', axe: 'melee', axes: 'melee', fist: 'melee', mage: 'magic', healer: 'magic', bow: 'ranged', crossbow: 'ranged' });
const mean = (a) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0);

/* ── the reference cell ───────────────────────────────────────────────────── */
export function refCell(R, point, seat, hours, seeds) {
  const cell = { id: ['REF', point.id, seat.id].join(':'), ground: point.ground, party: seat.party, level: point.level, hours, seeds, profile: 'played',
    ...(point.open ? {} : { gear: { uniques: true, openAlso: [point.ground] } }) };
  let tier = 'normal';
  if (seat.tier === 'hardest') {
    const ts = R.tiers.tiersOf(point.ground);
    tier = ts.includes('deadly') ? 'deadly' : ts.includes('dangerous') ? 'dangerous' : 'normal';
  }
  if (tier !== 'normal') {
    cell.options = { tier };
    const pull = R.tiers.pullOfTier(R.tiers.tierRowOf(point.ground, tier), seat.party.length);
    if (pull) cell.density = pull;
  }
  return { cell, tier };
}
/* one row a cell: every number a head (a party's is the mean of its seats; deaths are the party's sum) */
export function rowOf(m, party) {
  const hs = m.heroes;
  const main = mean(hs.map((h, i) => (h.skillXpPerH || {})[MAIN[party[i]] || 'melee'] || 0));
  return {
    levelXpPerH: Math.round(mean(hs.map((h) => h.levelXpPerH))), mainSkillXpPerH: Math.round(main),
    defenseXpPerH: Math.round(mean(hs.map((h) => (h.skillXpPerH || {}).defense || 0))),
    incomePerH: Math.round(mean(hs.map((h) => h.incomePerH))), storePerH: Math.round(mean(hs.map((h) => h.storePerH))),
    netPerH: Math.round(mean(hs.map((h) => h.profitPerH))), netWithRaresPerH: Math.round(mean(hs.map((h) => h.netWithRaresPerH))),
    takenPerH: Math.round(mean(hs.map((h) => h.takenPerH))), takenBySeat: hs.map((h) => Math.round(h.takenPerH)), killsPerH: m.party.killsPerH, deaths: hs.reduce((n, h) => n + h.deaths, 0),
    lowHpP10: Math.min(...hs.map((h) => (h.encMinHpPct || {}).p10 ?? 100)),
  };
}
const pointsWanted = () => {
  const ids = String(arg('at', REF_POINTS.map((p) => p.id).join(','))).split(',');
  return ids.map((id) => REF_POINTS.find((p) => p.id === id) || bad('no such reference point ' + id + ' (' + REF_POINTS.map((p) => p.id).join(', ') + ')'));
};
const commitOf = () => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };

async function ref() {
  const { loadCellRunner } = await import(u('tools/balance-sim/cell.mjs'));
  const R = await loadCellRunner(ROOT);
  const BS = await import(u('src/data/balance-sheet.js'));
  const hours = Number(arg('hours', 1)), seeds = Number(arg('seeds', 2));
  const out = { schema: 'hearthrise.balance-program.ref/1', commit: commitOf(), hours, seeds, points: {} };
  console.log('REF: played profile, career-line skills, store supplies, ' + seeds + ' seeds x ' + hours + ' h. Every number is AN HOUR, A HEAD.');
  console.log('point L | seat | tier | Level XP | x contract | main skill XP | gold in | store bill | net gold | net with rares | damage taken | kills (party) | deaths | low HP p10 %');
  for (const p of pointsWanted()) {
    out.points[p.id] = { ground: p.ground, level: p.level, open: p.open, contractXpPerH: Math.round(BS.contractXpPerH(p.level)), seats: {} };
    for (const s of REF_SEATS) {
      const { cell, tier } = refCell(R, p, s, hours, seeds);
      let r;
      try { r = rowOf(R.runCell(cell), s.party); } catch (e) { console.log([p.id + ' L' + p.level, s.id, tier, 'ERROR ' + e.message].join(' | ')); continue; }
      out.points[p.id].seats[s.id] = { tier, ...r };
      console.log([p.id + ' L' + p.level + (p.open ? '' : ' (staged)'), s.id, tier, r.levelXpPerH, x(r.levelXpPerH, BS.contractXpPerH(p.level)), r.mainSkillXpPerH, r.incomePerH, r.storePerH, r.netPerH, r.netWithRaresPerH, r.takenPerH, r.killsPerH, r.deaths, r.lowHpP10].join(' | '));
    }
  }
  if (has('write')) {
    const prev = existsSync(REF_FILE) ? JSON.parse(readFileSync(REF_FILE, 'utf8')) : { points: {} };
    out.points = { ...prev.points, ...out.points };
    writeFileSync(REF_FILE, JSON.stringify(out, null, 1) + '\n');
    console.log('wrote ' + REF_FILE);
  }
}

async function what() {
  const { loadCellRunner } = await import(u('tools/balance-sim/cell.mjs'));
  const { loadLines, skillsAt } = await import(u('tools/balance-sim/skill-lines.mjs'));
  const R = await loadCellRunner(ROOT);
  const [p] = pointsWanted();
  if (!arg('at')) bad('what: name ONE reference point with --at');
  const s = REF_SEATS.find((q) => q.id === arg('seat', 'lone')) || bad('no such seat ' + arg('seat'));
  const hours = Number(arg('hours', 1)), seeds = Number(arg('seeds', 2));
  let steps;
  try {
    const raw = arg('patch-file') ? JSON.parse(readFileSync(arg('patch-file'), 'utf8')) : JSON.parse(arg('patch') || bad('what: give --patch or --patch-file'));
    steps = Array.isArray(raw) ? raw : [{ label: arg('label', 'the patch'), patch: raw }];
  } catch (e) { bad('what: the patch is not JSON: ' + e.message); }
  const { cell: base, tier } = refCell(R, p, s, hours, seeds);
  const merge = (patch0) => {
    const patch = { ...patch0 };
    if (patch.skillBump) {
      const party = patch.party || base.party;
      patch.skillsBySeat = party.map((style) => {
        const lv = skillsAt(loadLines(), party.length > 1 ? 'party' : 'alone', style, patch.level || base.level), main = MAIN[style] || 'melee';
        return Object.fromEntries(['melee', 'ranged', 'magic', 'defense'].map((k) => [k, k === main || k === 'defense' ? lv[k] + patch.skillBump : lv[k]]));
      });
      delete patch.skillBump;
    }
    return { ...base, ...patch, ...(patch.gear ? { gear: { ...(base.gear || {}), ...patch.gear } } : {}), ...(patch.options ? { options: { ...(base.options || {}), ...patch.options } } : {}) };
  };
  const r0 = rowOf(R.runCell(base), base.party);
  console.log('WHAT: ' + p.id + ' L' + p.level + ', seat ' + s.id + ' (' + tier + '), ' + seeds + ' seeds x ' + hours + ' h, paired dice. Ratios are x REF; 1.000 = no change.');
  console.log('row | Level XP/h | x REF | main skill XP x REF | damage taken x REF | gold in x REF | store bill/h | net gold/h (REF ' + r0.netPerH + ') | deaths | low HP p10 %');
  console.log(['REF', r0.levelXpPerH, '1.000', '1.000', '1.000', '1.000', r0.storePerH, r0.netPerH, r0.deaths, r0.lowHpP10].join(' | '));
  const singles = [];
  steps.forEach((st, i) => {
    let r;
    try { const c = merge(st.patch || {}); r = rowOf(R.runCell({ ...c, id: base.id + ':what:' + i }), c.party); } catch (e) { console.log([st.label, 'ERROR ' + e.message].join(' | ')); return; }
    const rx = r.levelXpPerH / r0.levelXpPerH, rt = r0.takenPerH ? r.takenPerH / r0.takenPerH : 1;
    console.log([st.label || 'step ' + (i + 1), r.levelXpPerH, rx.toFixed(3), x(r.mainSkillXpPerH, r0.mainSkillXpPerH), rt.toFixed(3), x(r.incomePerH, r0.incomePerH), r.storePerH, r.netPerH, r.deaths, r.lowHpP10].join(' | '));
    if (steps.length > 2 && i === steps.length - 1) {
      const px = singles.reduce((a, b) => a * b[0], 1), sx = singles.reduce((a, b) => a + b[0] - 1, 1), pt = singles.reduce((a, b) => a * b[1], 1), st2 = singles.reduce((a, b) => a + b[1] - 1, 1);
      console.log('  the single steps multiplied / added: XP x' + px.toFixed(3) + ' / x' + sx.toFixed(3) + ', measured x' + rx.toFixed(3) + '; taken x' + pt.toFixed(3) + ' / x' + st2.toFixed(3) + ', measured x' + rt.toFixed(3));
    } else singles.push([rx, rt]);
  });
}

function loadRef() {
  if (!existsSync(REF_FILE)) bad('no ' + REF_FILE + ': run `node tools/balance-program/measure.mjs ref --write` first');
  return JSON.parse(readFileSync(REF_FILE, 'utf8'));
}
function price() {
  const gold = Number(String(process.argv[3] || '').replace(/[_,]/g, ''));
  if (!(gold > 0)) bad('price: give a gold amount, e.g. price 150000 --at ford');
  const snap = loadRef();
  let pid = arg('at');
  if (!pid) {
    const L = Number(arg('level', 0));
    if (!(L > 0)) bad('price: give --at <point> or --level <L>');
    pid = [...REF_POINTS].filter((p) => snap.points[p.id]).sort((a, b) => Math.abs(a.level - L) - Math.abs(b.level - L))[0].id;
  }
  const pt = snap.points[pid] || bad('ref.json has no point ' + pid);
  console.log('PRICE: ' + gold.toLocaleString('en-US') + ' gold at ' + pid + ' (Level ' + pt.level + '), ref.json measured on ' + snap.commit + '.');
  console.log('seat | net gold/h a head | REF HOURS (price / net) | note');
  for (const s of REF_SEATS) {
    const r = pt.seats[s.id]; if (!r) continue;
    console.log([s.id, r.netPerH, r.netPerH > 0 ? (gold / r.netPerH).toFixed(1) : 'never (net is not positive)', r.tier].join(' | '));
  }
  const real = pt.level <= REAL_OWN_FOUR_NET[REAL_OWN_FOUR_NET.length - 1][0] ? REAL_OWN_FOUR_NET.find(([top]) => pt.level <= top)[1] : null;
  console.log('player | heroes x hunt h/day | seat | net gold a hero-hour (source) | account net gold/day | days to earn it | days at its spending share | label');
  for (const pl of REFERENCE_PLAYERS) {
    const r = pt.seats[pl.seat]; if (!r) continue;
    /* a four: the REAL net where real fours exist (the harness four over-buys at the store, HARNESS_GAPS); past Level 84 the harness's,
       with the store bill scaled by the share of supplies the player buys */
    const share = pl.stock === 'store' || pl.stock === 'market' ? 1 : pl.stock === 'third own' ? 2 / 3 : 0;
    const useReal = pl.seat === 'four' && real !== null;
    const net = useReal ? real : r.incomePerH - r.storePerH * share;
    const day = net * pl.heroes * pl.huntHoursADay;
    const days = day > 0 ? gold / day : null;
    console.log([pl.name, pl.heroes + ' x ' + pl.huntHoursADay, pl.seat, Math.round(net) + (useReal ? ' (REAL, thin)' : ' (harness)'), Math.round(day),
      pl.id === 'whale' ? '0 (buys gold)' : days ? days.toFixed(1) : 'never', pl.id === 'whale' ? '0' : days ? (days / pl.spends).toFixed(1) : 'never', pl.label].join(' | '));
  }
  console.log('"days at its spending share": the account puts only that share of what it earns into sinks (REFERENCE_PLAYERS.spends).');
}

/** DB seconds a day and journal rows a day one reference account costs. `watch`: 'attended' (the tab is open only for the
    attended minutes) or 'real' (COST.real.watchedShareOfHuntedHours of hunted hours run at the watched cadence, as the journal shows). */
export function accountCost(pl, watch, reads) {
  const R = COST.real, hunted = pl.heroes * pl.huntHoursADay, town = pl.heroes * pl.townHoursADay;
  const tabH = watch === 'real' ? R.watchedShareOfHuntedHours * pl.huntHoursADay : Math.min(pl.attendedMinADay / 60, pl.huntHoursADay);
  const watchedHH = Math.min(hunted, tabH * pl.heroes), awayHH = hunted - watchedHH;   // a viewed four settles all four seats
  const settles = watchedHH * COST.commitsAnHour.watched + awayHH * COST.commitsAnHour.away;
  const dbS = settles * R.dbMsAHeroSettle / 1000 + town * R.townSettlesAHeroHour * R.townDbMsASettle / 1000
    + tabH * (pl.heroes === 1 ? R.tabHourReadsS.afterServerCostLane : reads);   // a lone hero has no off-screen heroes to poll
  /* journal rows follow settles: REAL 216 rows at 110 settles a hunted hero-hour */
  const rows = settles * R.ledgerRowsAHuntedHeroHour / R.combatSettlesAHeroHour + town * R.ledgerRowsATownHeroHour;
  return { dbS, rows, tabH };
}
const planFor = (cores) => { const p = COST.plans.find((x) => x[1] >= cores && (cores <= 1.4 || x[0] !== 'Small')); return p ? p[0] + ' $' + p[2] : 'NO SINGLE DATABASE (the top is ' + COST.plans.at(-1)[1] + ' cores)'; };

function cost() {
  const base = JSON.parse(readFileSync(join(ROOT, 'tests', 'per-player-cost.baseline.json'), 'utf8')).fixtures;
  const add = Object.fromEntries(String(arg('add', 'statements=0,ledger=0,writes=0')).split(',').map((kv) => { const [k, v] = kv.split('='); return [k, Number(v) || 0]; }));
  const share = Number(arg('share', 1)), R = COST.real, C = COST.commitsAnHour, after = process.argv.includes('--after');
  const reads = after ? R.tabHourReadsS.afterServerCostLane : R.tabHourReadsS.today;
  console.log('COST: one hunting hero (tests/per-player-cost.baseline.json, MEASURED on the replayed chain). A hero commits ' + C.away + ' times an hour away and ' + C.watched + ' watched; REAL heroes ran at ' + R.combatSettlesAHeroHour + '.');
  console.log('fixture | statements a settle | statements a hero-hour away / watched | row writes a hero-hour away / watched | ledger rows a hero-hour (fixture, away) | REAL');
  for (const [k, f] of Object.entries(base)) {
    const n = /party4/.test(k) ? 4 : 1, per = (x, cc) => Math.round(x * cc / n);
    console.log([k, f.statements_a_settle, per(f.statements_a_settle, C.away) + ' / ' + per(f.statements_a_settle, C.watched), per(f.row_writes_a_settle, C.away) + ' / ' + per(f.row_writes_a_settle, C.watched), f.ledger_rows_a_hero_hour, R.ledgerRowsAHuntedHeroHour].join(' | '));
  }
  const al = COST.allowance;
  console.log('\nTHE SYSTEM ADDS, a hero that uses it: statements a settle ' + (add.statements || 0) + ' (allowance ' + al.statementsASettle + '), ledger rows a hero-hour ' + (add.ledger || 0) + ' (allowance ' + al.ledgerRowsAHeroHour + '), row writes a hero-hour ' + (add.writes || 0) + ' (allowance ' + al.rowWritesAHeroHour + '), polls an account-hour ' + (add.polls || 0) + ' (allowance ' + al.pollsAnAccountHour + '); share of heroes ' + share);
  const over = (add.statements || 0) > al.statementsASettle || (add.ledger || 0) > al.ledgerRowsAHeroHour || (add.writes || 0) > al.rowWritesAHeroHour || (add.polls || 0) > al.pollsAnAccountHour;
  console.log(over ? 'OVER THE ALLOWANCE: name it in the dive and hand it to the platform dive.' : 'inside the allowance.');
  /* what the addition costs: a statement on the settle path is paid at the hero's settle rate (ASSUMED 2 ms a small statement), a row an hour is a row an hour */
  const addDbS = (pl) => share * pl.heroes * pl.huntHoursADay * (add.statements || 0) * R.combatSettlesAHeroHour * 2 / 1000;
  const addRows = (pl) => share * pl.heroes * pl.huntHoursADay * (add.ledger || 0);

  console.log('\nONE ACCOUNT A DAY' + (after ? ' (after lane/c-server-cost: no off-screen poll)' : ' (today)') + ', REAL production means (' + R.read + '). "as attended" = the tab is open only for the attended minutes; "as journalled" = ' + Math.round(R.watchedShareOfHuntedHours * 100) + '% of hunted hours at the watched cadence.');
  console.log('player | hunted + town hero-hours | DB s as attended | DB s as journalled | journal rows as attended | as journalled | + this system (DB s, rows)');
  const cells = {};
  for (const pl of REFERENCE_PLAYERS) {
    const A = accountCost(pl, 'attended', reads), J = accountCost(pl, 'real', reads);
    cells[pl.id] = { A, J };
    console.log([pl.name, (pl.heroes * pl.huntHoursADay).toFixed(1) + ' + ' + pl.heroes * pl.townHoursADay, Math.round(A.dbS), Math.round(J.dbS), Math.round(A.rows).toLocaleString('en-US'), Math.round(J.rows).toLocaleString('en-US'), '+' + addDbS(pl).toFixed(1) + ', +' + Math.round(addRows(pl))].join(' | '));
  }
  const cores = (dbS, n) => dbS * n / 86400 * COST.peakOverMean / COST.dbBusyTarget + R.fixedCronSADay / 86400;
  console.log('\nN ACCOUNTS OF ONE KIND: database cores to provision (mean x ' + COST.peakOverMean + ' peak, ASSUMED, at ' + COST.dbBusyTarget * 100 + '% busy) and the plan that holds them, as attended and as journalled; journal rows a day (as journalled) against the prune (' + COST.ledgerPruneRowsADay.live.toLocaleString('en-US') + ' live, ' + COST.ledgerPruneRowsADay.staged.toLocaleString('en-US') + ' staged); the journal kept ' + COST.ledgerKeepDays + ' days.');
  console.log('player | accounts | cores as attended | plan | cores as journalled | plan | journal rows a day | prune live / staged | journal GB kept');
  const f = (k) => k.toFixed(k < 10 ? 1 : 0);
  for (const pl of REFERENCE_PLAYERS) for (const pop of POPULATIONS) {
    const { A, J } = cells[pl.id], n = pop.online, ka = cores(A.dbS + addDbS(pl), n), kj = cores(J.dbS + addDbS(pl), n), rows = (J.rows + addRows(pl)) * n;
    console.log([pl.name, n, f(ka), planFor(ka), f(kj), planFor(kj), Math.round(rows).toLocaleString('en-US'),
      (rows > COST.ledgerPruneRowsADay.live ? 'OUTRUN' : 'holds') + ' / ' + (rows > COST.ledgerPruneRowsADay.staged ? 'OUTRUN' : 'holds'), f(rows * COST.ledgerKeepDays * R.ledgerBytesARow / 1e9)].join(' | '));
  }
  console.log('CITED (tools/qa/audit-2026-11-19-server/findings.md, the 11-02 load rig): 100 accounts with every tab open and every hero hunting = 1.45 of Small\'s 2 cores. The production means above give 1.56 for that hour.');
}

function model() {
  const t = (title, rows, cols) => { console.log('\n' + title); console.log(cols.join(' | ')); for (const r of rows) console.log(cols.map((c) => (Array.isArray(r[c]) ? r[c].join('+') : r[c])).join(' | ')); };
  t('LEDGERS', LEDGERS, ['id', 'unit', 'home']);
  t('STACK CLASSES', STACK_CLASSES, ['id', 'rule', 'cap', 'examples']);
  t('LEVERS', LEVERS, ['id', 'cls', 'on', 'size', 'label', 'system']);
  t('REFERENCE POINTS (formula only past them: Levels ' + FORMULA_ONLY_LEVELS.join(', ') + ')', REF_POINTS, ['id', 'ground', 'level', 'gearTier', 'open']);
  t('REFERENCE SEATS', REF_SEATS, ['id', 'name', 'party', 'tier', 'note']);
  t('REFERENCE PLAYERS', REFERENCE_PLAYERS, ['id', 'name', 'heroes', 'seat', 'premium', 'huntHoursADay', 'realHuntHoursADay', 'townHoursADay', 'attendedMinADay', 'refillsADay', 'stock', 'spends', 'weight', 'label', 'note']);
  t('WHERE THE HARNESS DISAGREES WITH REAL PLAYERS (docs/design/balance-program/10-real-players.md)', HARNESS_GAPS, ['on', 'gap']);
  t('SERVER AGES', SERVER_AGES, ['id', 'name', 'note']);
  t('POPULATIONS', POPULATIONS, ['id', 'online', 'note']);
}

const STACK_TOOL = join(ROOT, 'tools', 'balance-sim', 'staged', 'whole-game-stack.mjs');
if (isMain(import.meta.url)) {
  if (['curves', 'deep', 'stack', 'fits'].includes(mode)) {
    process.exit(spawnSync(process.execPath, [STACK_TOOL, ...process.argv.slice(2)], { stdio: 'inherit' }).status ?? 1);
  }
  const run = { model, ref, what, price, cost }[mode];
  if (!run) bad('usage: measure.mjs model | ref | what | price | cost | curves | deep | stack | fits   (see this file\'s header)');
  Promise.resolve(run()).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
}
