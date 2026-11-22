#!/usr/bin/env node
// tools/balance-sim/party-tier-xp.mjs — WHAT A PARTY EARNS ON EACH TIER, against the pace contract and its own heroes alone
// (lane/a-party-xp-tier, 2026-11-16: a mixed four on Deadly read 3.3-3.9x the contract on the engine, about 5x live;
// lane/d-flat-party-xp, the same day: Tyler's "just balance the hunting grounds xp vs having a unique formula everywhere", so the
// party bonus is ONE table, src/data/party-class-xp.js PARTY_SIZE_XP (by party size alone since S-10 c, 2026-11-21), and each ground's own dials carry the rest).
//
// Plays the REAL engine (tools/balance-sim cells, the settle the world tick runs) on every ground x tier the ground has x
// Level (the band's floor and middle): five lone ways (tank, hammer, bow, mage, healer) at the Level and a healer 5 under,
// then the mixed parties: "andy" (hammer, bow, mage at the Level, a healer 5 under: the live party that showed it), the
// designer's four (tank, healer, bow, mage), two duos and a trio. Each reading:
//   xC        a head's Level XP an hour over the pace contract at the party's top Level (balance-sheet.js contractXpPerH, grade.mjs xpVsContract)
//   vs same   a head over the mean of the SAME heroes alone at the same Level and tier (Tyler 2026-11-16's bar: >= 1 on Dangerous and Deadly)
//   seat      a head over its best way alone (the lowest seat; printed, not the bar)
// THE VERDICT, per ground (Tyler 2026-11-16): every Dangerous/Deadly mix at or over its heroes alone, and a mixed four (andy or the four, floor
// or middle) on Deadly at most --cap x the contract (2.5). Normal is printed, never judged (not tuned for parties).
// A party's Level XP is its cell times the even share (src/core/hunt/xp-share.js) and a cell moves no blow, so `--table "2=a;3=b;4=c"`
// reads every party number as it would stand on that table (each mix scaled by its new cell over this tree's), the lone ones untouched. A kill's
// share floors, so where a kill pays a few XP (the first grounds) re-measure on the edited tree, never trust the scaled read alone.
//
// THE PLAYED HERO (the balance audit's fix 1, lane/d-audit-fixes-sim 2026-11-19): every cell plays the hero players set up (cell.mjs
// `profile: 'played'`: the recorded bars, accessories and options) with a PARTY-LEVELLED hero's skills (skill-lines.mjs 'party'), the lone
// cells too, since "the same heroes alone" are those heroes with those skills. `--profile plain` reads the old harness hero (every skill at
// its Level, the default bar) for a before/after.
//
//   node tools/balance-sim/party-tier-xp.mjs [--grounds a,b] [--seeds 2] [--hours 0.5] [--workers 4] [--cap 2.5] [--table ...] [--cache file.jsonl] [--profile played|plain]
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

const SEEDS = Number(arg('--seeds', 2)), HOURS = Number(arg('--hours', 0.5)), WORKERS = Number(arg('--workers', 4)), CAP = Number(arg('--cap', 2.5));
const PROFILE = arg('--profile', 'played');
if (!['played', 'plain'].includes(PROFILE)) throw new Error('party-tier-xp: --profile played|plain');
/* every cell: the played hero on the party line (the same heroes, alone or together), or the plain harness hero */
const asPlayed = PROFILE === 'played' ? { profile: 'played', skillLine: 'party' } : {};
const grounds = arg('--grounds', null) ? arg('--grounds').split(',') : Object.keys(G.HUNT_GROUNDS);
const WAYS = ['tank', 'hammer', 'bow', 'mage', 'healer'];
/* name -> [ways, Level offset per seat] */
const PARTIES = Object.freeze({
  andy: [['hammer', 'bow', 'mage', 'healer'], [0, 0, 0, -5]],
  four: [['tank', 'healer', 'bow', 'mage'], [0, 0, 0, 0]],
  'duo tank+healer': [['tank', 'healer'], [0, 0]],
  'duo tank+bow': [['tank', 'bow'], [0, 0]],
  'trio tank+healer+bow': [['tank', 'healer', 'bow'], [0, 0, 0]],
  /* ONE STYLE (lane/d-party-pace, 2026-11-18): four hammers, printed, never held to the >= bar (Tyler 2026-10-31: one class never out-earns its heroes alone) */
  hammers: [['hammer', 'hammer', 'hammer', 'hammer'], [0, 0, 0, 0]],
});
const ONE_CLASS = new Set(['hammers']);
/* --table: the what-if table by size alone (S-10 c), { n: cell } */
const WHAT_IF = arg('--table', null) ? Object.fromEntries(arg('--table').split(';').map((x) => { const [n, c] = x.split('='); return [Number(n), Number(c)]; })) : null;
const cellOf = (tab, ways) => tab[Math.min(ways.length, 4)];
const kOf = (ways) => (WHAT_IF ? cellOf(WHAT_IF, ways) / cellOf(PCX.PARTY_SIZE_XP, ways) : 1);

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
    const base = (id, party, level) => ({ id: [g, tier, at, s, id, PROFILE].join(':'), ground: g, party, level, hours: HOURS, seeds: 1, seedBase: s, ...tierOpts(g, tier, party.length), ...stagedGear(g), ...asPlayed });
    for (const w of WAYS) jobs.push(base('solo-' + w + '@0', [w], L));
    jobs.push(base('solo-healer@-5', ['healer'], Math.max(1, L - 5)));
    for (const [name, [ways, off]] of Object.entries(PARTIES)) jobs.push(base(name, ways, off.map((o) => Math.max(1, L + o))));
  }
  return jobs;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; };

function judge(played) {
  const at = (g, tier, lv, s, id) => played.get([g, tier, lv, s, id, PROFILE].join(':'));
  const rows = [];
  for (const g of grounds) for (const tier of T.tiersOf(g)) for (const [lvName, L] of levelsOf(g)) {
    const seeds = [...Array(SEEDS).keys()];
    const alone = (w, o) => mean(seeds.map((s) => at(g, tier, lvName, s, 'solo-' + w + '@' + o).heroes[0].levelXpPerH));
    const med = median(WAYS.map((w) => alone(w, 0)));
    for (const [name, [ways, off]] of Object.entries(PARTIES)) {
      const k = kOf(ways);
      const cells = seeds.map((s) => at(g, tier, lvName, s, name));
      const seatXp = ways.map((_, i) => k * mean(cells.map((c) => c.heroes[i].levelXpPerH)));
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
const fours = (x) => x.name === 'andy' || x.name === 'four';

function report(rows) {
  const tab = WHAT_IF || PCX.PARTY_SIZE_XP;
  console.log('party-tier-xp: the party table ' + JSON.stringify(tab) + (WHAT_IF ? ' (a what-if: this tree pays ' + JSON.stringify(PCX.PARTY_SIZE_XP) + ')' : '') + '; ' + SEEDS + ' seeds x ' + HOURS + ' h a cell; the ' + PROFILE + ' hero' + (PROFILE === 'played' ? ' (party-levelled skills, skill-lines.mjs)' : ''));
  console.log('  xC = Level XP a head over the pace contract (solo: the median lone way); vs same = a head over the same heroes alone (mean), seat = over its best way alone; ' + MIXES.join(', '));
  console.log('ground               tier       at       L | solo xC  andy xC  four xC | vs same: ' + MIXES.map((n) => n.split(' ')[0]).join(' ') + ' | seat: ' + MIXES.map((n) => n.split(' ')[0]).join(' ') + ' | deaths');
  for (const g of grounds) for (const tier of T.tiersOf(g)) for (const lv of ['floor', 'middle']) {
    const r = (n) => rows.find((x) => x.g === g && x.tier === tier && x.lvName === lv && x.name === n);
    const a = r('andy'), f = r('four');
    console.log(g.padEnd(20) + ' ' + tier.padEnd(10) + ' ' + lv.padEnd(6) + ' ' + String(a.L).padStart(3) + ' | ' + f2(a.soloC).padStart(7) + ' ' + f2(a.contract).padStart(8) + ' ' + f2(f.contract).padStart(8) + ' | '
      + MIXES.map((n) => f2(r(n).vsSame)).join(' ') + ' | ' + MIXES.map((n) => f2(r(n).seatMin)).join(' ') + ' | ' + MIXES.map((n) => r(n).deaths).join(','));
  }
  /* THE VERDICT a ground at a time: the lowest Dangerous/Deadly mix against its heroes alone (andy left out: its seat five under is the read for the
     cap, and a healer under the floor alone earns its own Level's pace) and the hottest Deadly four over the contract. */
  console.log('THE VERDICT (Tyler 2026-11-16): every Dangerous/Deadly mix >= its heroes alone; a Deadly four <= ' + CAP + 'x the contract. Normal printed, not judged.');
  console.log('  ground               lowest harder-tier mix vs alone          | hottest Deadly four xC          | Normal four vs alone (floor, middle)');
  let reds = 0;
  for (const g of grounds) {
    const h = rows.filter((x) => x.g === g && x.tier !== 'normal' && x.name !== 'andy' && !ONE_CLASS.has(x.name));
    const d = rows.filter((x) => x.g === g && x.tier === 'deadly' && fours(x));
    const n4 = rows.filter((x) => x.g === g && x.tier === 'normal' && x.name === 'four').map((x) => f2(x.vsSame)).join(', ');
    if (!h.length) { console.log('  ' + g.padEnd(20) + ' Normal only' + ' '.repeat(62) + '| ' + n4); continue; }
    const lo = h.reduce((m, x) => (x.vsSame < m.vsSame ? x : m));
    const hot = d.reduce((m, x) => (x.contract > m.contract ? x : m));
    const red = lo.vsSame < 1 || hot.contract > CAP;
    if (red) reds++;
    console.log('  ' + g.padEnd(20) + ' ' + f2(lo.vsSame) + ' (' + (lo.tier + ' ' + lo.lvName + ' ' + lo.name).padEnd(33) + ') | ' + f2(hot.contract) + ' (' + (hot.lvName + ' ' + hot.name).padEnd(12) + ')' + (red ? ' RED' : '    ') + '         | ' + n4);
  }
  console.log('  ' + (reds ? reds + ' ground(s) off the bars' : 'every ground on both bars'));
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
