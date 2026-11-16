#!/usr/bin/env node
// tools/balance-sim/party-tier-xp.mjs — WHAT A PARTY EARNS ON EACH TIER, against the pace contract and its own heroes alone
// (lane/a-party-xp-tier, 2026-11-16: a mixed four on Deadly read 3.3-3.9x the contract on the engine, about 5x live).
//
// Plays the REAL engine (tools/balance-sim cells, the settle the world tick runs) on every ground x tier the ground has x
// Level (the band's floor and middle): five lone ways (tank, hammer, bow, mage, healer) at the Level and a healer 5 under,
// then the mixed parties: "andy" (hammer, bow, mage at the Level, a healer 5 under: the live party that showed it), the
// designer's four (tank, healer, bow, mage), two duos and a trio. Each reading:
//   contract  a four's Level XP a head an hour over the pace contract at its top Level (balance-sheet.js contractXpPerH, grade.mjs xpVsContract)
//   seat      each seat over the SAME way alone at the same Level and tier (the lowest seat printed): above 1.00 = above solo
//   vsMedian  a head over the median lone way at the Level (10-25 §5's measure)
// A party's Level XP is the party cell times its even share (src/core/hunt/xp-share.js), so a flat party factor moves every
// party number by that factor and no lone one: `--at PM` prints each reading as it would stand at PARTY_XP_PM = PM
// (read off this tree's own factor), and the factor that would land the worst Deadly four on `--deadly X`.
//
//   node tools/balance-sim/party-tier-xp.mjs [--grounds a,b] [--seeds 2] [--hours 0.5] [--workers 4] [--at 650] [--cache file.jsonl]
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runPool } from './pool.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const G = await import(u('src/data/hunt-grounds.js'));
const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
const T = await import(u('src/data/hunt-tiers.js'));
const { contractXpPerH } = await import(u('src/data/balance-sheet.js'));
const PCX = await import(u('src/data/party-class-xp.js'));

const SEEDS = Number(arg('--seeds', 2)), HOURS = Number(arg('--hours', 0.5)), WORKERS = Number(arg('--workers', 4));
const NOW_PM = PCX.PARTY_XP_PM, AT_PM = Number(arg('--at', NOW_PM));
const grounds = arg('--grounds', null) ? arg('--grounds').split(',') : Object.keys(G.HUNT_GROUNDS);
const WAYS = ['tank', 'hammer', 'bow', 'mage', 'healer'];
/* name -> [ways, Level offset per seat] */
const PARTIES = Object.freeze({
  andy: [['hammer', 'bow', 'mage', 'healer'], [0, 0, 0, -5]],
  four: [['tank', 'healer', 'bow', 'mage'], [0, 0, 0, 0]],
  'duo tank+healer': [['tank', 'healer'], [0, 0]],
  'duo tank+bow': [['tank', 'bow'], [0, 0]],
  'trio tank+healer+bow': [['tank', 'healer', 'bow'], [0, 0, 0]],
});

const levelsOf = (g) => { const [lo, hi] = HUNT_INDEX[G.HUNT_GROUNDS[g].hunt].band; return [['floor', lo], ['middle', Math.round((lo + hi) / 2)]]; };
const stagedGear = (g) => (Object.hasOwn(G.OPEN_GROUNDS, g) ? {} : { gear: { openAlso: [g] } });
const tierOpts = (g, tier, n) => {
  if (tier === 'normal') return {};
  const pull = T.pullOfTier(T.tierRowOf(g, tier), n);
  return { options: { tier }, ...(pull ? { density: pull } : {}) };
};

function plan() {
  const jobs = [];
  for (const g of grounds) for (const tier of T.tiersOf(g)) for (const [at, L] of levelsOf(g)) for (let s = 0; s < SEEDS; s++) {
    const base = (id, party, level) => ({ id: [g, tier, at, s, id].join(':'), ground: g, party, level, hours: HOURS, seeds: 1, seedBase: s, ...tierOpts(g, tier, party.length), ...stagedGear(g) });
    for (const w of WAYS) jobs.push(base('solo-' + w + '@0', [w], L));
    jobs.push(base('solo-healer@-5', ['healer'], Math.max(1, L - 5)));
    for (const [name, [ways, off]] of Object.entries(PARTIES)) jobs.push(base(name, ways, off.map((o) => Math.max(1, L + o))));
  }
  return jobs;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; };

function judge(played) {
  const at = (g, tier, lv, s, id) => played.get([g, tier, lv, s, id].join(':'));
  const rows = [];
  for (const g of grounds) for (const tier of T.tiersOf(g)) for (const [lvName, L] of levelsOf(g)) {
    const seeds = [...Array(SEEDS).keys()];
    const alone = (w, o) => mean(seeds.map((s) => at(g, tier, lvName, s, 'solo-' + w + '@' + o).heroes[0].levelXpPerH));
    const med = median(WAYS.map((w) => alone(w, 0)));
    for (const [name, [ways, off]] of Object.entries(PARTIES)) {
      const cells = seeds.map((s) => at(g, tier, lvName, s, name));
      const seatXp = ways.map((_, i) => mean(cells.map((c) => c.heroes[i].levelXpPerH)));
      const head = mean(seatXp);
      const lv = off.map((o) => Math.max(1, L + o));
      /* the grader's read (grade.mjs xpVsContract): a head over the contract at the party's top Level (a seat 5 under at Level 1-5 reads the contract of a Level 1 hero) */
      const contract = head / contractXpPerH(Math.max(...lv));
      const seats = ways.map((w, i) => seatXp[i] / alone(w, off[i] === -5 ? -5 : 0));
      const deaths = cells.reduce((n, c) => n + c.heroes.reduce((m, h) => m + h.deaths, 0), 0);
      const vsSame = head / mean(ways.map((w, i) => alone(w, off[i] === -5 ? -5 : 0)));
      rows.push({ g, tier, lvName, L, name, head, contract, seatMin: Math.min(...seats), vsSame, seats, vsMedian: head / med, soloC: med / contractXpPerH(L), deaths, hours: SEEDS * HOURS });
    }
  }
  return rows;
}

const f2 = (x) => x.toFixed(2);
const MIXES = Object.keys(PARTIES);
/* --at-ground g=pm,h=pm: a factor per ground (the rest at --at) */
const AT_GROUND = Object.fromEntries(String(arg('--at-ground', '')).split(',').filter(Boolean).map((x) => { const [g, pm] = x.split('='); return [g, Number(pm)]; }));
const kOf = (g) => (Object.hasOwn(AT_GROUND, g) ? AT_GROUND[g] : AT_PM) / NOW_PM;

function report(rows) {
  console.log('party-tier-xp: PARTY_XP_PM on this tree ' + NOW_PM + ', read at ' + AT_PM + (Object.keys(AT_GROUND).length ? ' (per ground: ' + JSON.stringify(AT_GROUND) + ')' : '') + '; ' + SEEDS + ' seeds x ' + HOURS + ' h a cell');
  console.log('  xC = Level XP a head over the pace contract (solo: the median lone way); vs same = a head over the same heroes alone (mean), seat = over its best way alone; ' + MIXES.join(', '));
  console.log('ground               tier       at       L | solo xC  andy xC  four xC | vs same: ' + MIXES.map((n) => n.split(' ')[0]).join(' ') + ' | seat: ' + MIXES.map((n) => n.split(' ')[0]).join(' ') + ' | deaths');
  for (const g of grounds) for (const tier of T.tiersOf(g)) for (const lv of ['floor', 'middle']) {
    const k = kOf(g);
    const r = (n) => rows.find((x) => x.g === g && x.tier === tier && x.lvName === lv && x.name === n);
    const a = r('andy'), f = r('four');
    console.log(g.padEnd(20) + ' ' + tier.padEnd(10) + ' ' + lv.padEnd(6) + ' ' + String(a.L).padStart(3) + ' | ' + f2(a.soloC).padStart(7) + ' ' + f2(a.contract * k).padStart(8) + ' ' + f2(f.contract * k).padStart(8) + ' | '
      + MIXES.map((n) => f2(r(n).vsSame * k)).join(' ') + ' | ' + MIXES.map((n) => f2(r(n).seatMin * k)).join(' ') + ' | ' + MIXES.map((n) => r(n).deaths).join(','));
  }
  const target = Number(arg('--deadly', 2.5));
  const fours = (x) => x.name === 'andy' || x.name === 'four';
  /* (A) ONE flat factor: lands the hottest Deadly four on the target */
  const deadly = rows.filter((x) => x.tier === 'deadly' && fours(x));
  if (!deadly.length) return;
  const hot = deadly.reduce((m, x) => (x.contract > m.contract ? x : m));
  const pm = Math.floor(((NOW_PM * target) / hot.contract) / 5) * 5;
  console.log('(A) ONE FACTOR: the hottest Deadly four ' + hot.g + ' ' + hot.lvName + ' ' + hot.name + ' ' + f2(hot.contract) + 'x at ' + NOW_PM + '; PARTY_XP_PM ' + pm + ' lands it at ' + target + 'x');
  for (const tier of T.TIER_IDS) {
    const on = rows.filter((x) => x.tier === tier && x.name !== 'andy');
    const lo = on.reduce((m, x) => (x.vsSame < m.vsSame ? x : m));
    const fc = rows.filter((x) => x.tier === tier && fours(x)).map((x) => x.contract);
    console.log('  ' + tier.padEnd(9) + ' fours ' + f2((Math.min(...fc) * pm) / NOW_PM) + '-' + f2((Math.max(...fc) * pm) / NOW_PM) + 'x the contract; lowest mix vs same heroes alone '
      + f2((lo.vsSame * pm) / NOW_PM) + ' (' + lo.g + ' ' + lo.lvName + ' ' + lo.name + '); ' + on.filter((x) => (x.vsSame * pm) / NOW_PM <= 1).length + ' of ' + on.length + ' mixes at or under alone');
  }
  const harder = rows.filter((x) => x.tier !== 'normal' && x.name !== 'andy');
  const lowH = harder.reduce((m, x) => (x.vsSame < m.vsSame ? x : m));
  console.log('  every Dangerous/Deadly mix stays over its heroes alone down to PARTY_XP_PM ' + Math.ceil(NOW_PM / lowH.vsSame) + ' (' + lowH.g + ' ' + lowH.tier + ' ' + lowH.lvName + ' ' + lowH.name + ' ' + f2(lowH.vsSame) + ' now)');
  const normal = rows.filter((x) => x.tier === 'normal' && x.name !== 'andy');
  const lowN = normal.reduce((m, x) => (x.vsSame < m.vsSame ? x : m));
  const keepN = Math.ceil(NOW_PM / lowN.vsSame);
  const dAt = (p) => f2((Math.max(...deadly.map((x) => x.contract)) * p) / NOW_PM);
  console.log('  every Normal mix stays over its heroes alone down to PARTY_XP_PM ' + keepN + '; there the hottest Deadly four reads ' + dAt(keepN) + 'x');
  /* (G) A FACTOR PER GROUND, the same on every tier: each ground's hottest Deadly four onto the target, never raised */
  console.log('(G) ONE FACTOR A GROUND, every tier: the cut that lands each ground\'s hottest Deadly four on ' + target + 'x (none where it reads under)');
  for (const g of grounds) {
    const d = rows.filter((x) => x.g === g && x.tier === 'deadly' && fours(x));
    if (!d.length) { console.log('  ' + g.padEnd(20) + ' no Deadly'); continue; }
    const top = Math.max(...d.map((x) => x.contract));
    const gp = top > target ? Math.floor(((NOW_PM * target) / top) / 5) * 5 : NOW_PM;
    const h = rows.filter((x) => x.g === g && x.tier !== 'normal' && x.name !== 'andy');
    const lo = h.reduce((m, x) => (x.vsSame < m.vsSame ? x : m));
    console.log('  ' + g.padEnd(20) + ' Deadly four ' + f2(top) + 'x -> ' + String(gp).padStart(4) + ': ' + f2((top * gp) / NOW_PM) + 'x; lowest harder-tier mix vs alone ' + f2((lo.vsSame * gp) / NOW_PM) + ' (' + lo.tier + ' ' + lo.lvName + ' ' + lo.name + ')');
  }
}

async function main() {
  const jobs = plan();
  const cache = arg('--cache', null);
  const tmp = cache ? null : mkdtempSync(join(tmpdir(), 'party-tier-xp-'));
  const out = cache || join(tmp, 'cells.jsonl');
  try {
    const res = await runPool(jobs, out, { root: ROOT, workers: WORKERS, cpuMax: 101, log: () => {} });
    if (res.failed) { console.log('  ' + res.failed + ' cell(s) failed'); process.exitCode = 2; return; }
    const played = new Map(readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => { const c = JSON.parse(l); return [c.id, c]; }));
    const missing = jobs.filter((j) => !played.has(j.id));
    if (missing.length) { console.log('  ' + missing.length + ' cell(s) not played'); process.exitCode = 2; return; }
    report(judge(played));
  } finally { if (tmp) rmSync(tmp, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e); process.exit(2); });
