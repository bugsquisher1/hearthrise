#!/usr/bin/env node
// tools/balance-sim/party-advice-table.mjs — DOES THE HUNTS WINDOW SEND A PARTY WHERE IT PAYS BEST? (lane/a-party-advice-glade, 2026-11-18)
//
// The advice (src/shell/hunt-list.js recommendation) reads Levels and data, never a settle, so this plays what it claims. For each Level, every
// ground the Hunts list holds whose band holds it or that it outgrew by at most --outgrown Levels (the "Easier:" ground a note names), on every
// tier the ground offers: a party (default the four of four classes: tank, Healer, bow, wand) with every seat at the Level, on the real settle
// (tools/balance-sim cells, the settle the world tick runs), --seeds x --hours a cell. Each line: a head's Level XP an hour, deaths, a head's
// profit an hour (printed, never judged: NO PROFIT MOLDS, Tyler 2026-11-13). THE VERDICT a Level at a time: the (ground, tier) that pays a head
// the most Level XP with no death, and the ground the advice names for that group; it agrees when the advice's ground pays, on its own best tier
// with no death, at least --within of that (0.95: two seeds of half an hour read a few percent apart). Every tier counts: Normal is not tuned for
// parties (Tyler 2026-11-16) and the leader picks the tier. Exit 1 when a Level disagrees (a reading, not a CI guard). `--party hammer` reads a
// hero alone against the lone advice.
//
// THE PLAYED HERO (the balance audit's fix 1, lane/d-audit-fixes-sim 2026-11-19): a party plays as players set one up (cell.mjs `profile:
// 'played'`, a party-levelled hero's skills, skill-lines.mjs), a hero alone on its own career's; `--profile plain` the old harness hero.
//
//   node tools/balance-sim/party-advice-table.mjs [--levels 5,8,13,16,25,28,45,50] [--party tank,healer,bow,mage] [--seeds 2] [--hours 0.5]
//                                                 [--outgrown 5] [--within 0.95] [--workers 3] [--cache file.jsonl] [--profile played|plain]
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runPool } from './pool.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const G = await import(u('src/data/hunt-grounds.js'));
const T = await import(u('src/data/hunt-tiers.js'));
const { huntRows, recommendation } = await import(u('src/shell/hunt-list.js'));
const { STYLES } = await import(u('tools/balance-sim/gear.mjs'));

const LEVELS = arg('--levels', '5,8,13,16,25,28,45,50').split(',').map(Number);
const PARTY = arg('--party', 'tank,healer,bow,mage').split(',');
const SEEDS = Number(arg('--seeds', 2)), HOURS = Number(arg('--hours', 0.5)), WORKERS = Number(arg('--workers', 3)), OUTGROWN = Number(arg('--outgrown', 5));
const WITHIN = Number(arg('--within', 0.95));
const PROFILE = arg('--profile', 'played');
if (!['played', 'plain'].includes(PROFILE)) throw new Error('party-advice-table: --profile played|plain');
for (const w of PARTY) if (!STYLES[w]) throw new Error('no style ' + w + ' (tools/balance-sim/styles.mjs)');

const ROWS = huntRows();
const groundOf = (hunt) => Object.values(G.HUNT_GROUNDS).find((g) => g.hunt === hunt).id;
const nearRows = (L) => ROWS.filter((r) => r.band[0] <= L && L <= r.band[1] + OUTGROWN);
const stagedGear = (g) => (Object.hasOwn(G.OPEN_GROUNDS, g) ? {} : { gear: { openAlso: [g] } });
const tierOpts = (g, tier, n) => {
  if (tier === T.DEFAULT_TIER) return {};
  const pull = T.pullOfTier(T.tierRowOf(g, tier), n);
  return { options: { tier }, ...(pull ? { density: pull } : {}) };
};
const idOf = (L, g, tier, s) => ['L' + L, g, tier, s, PROFILE].join(':');

function plan() {
  const jobs = [];
  for (const L of LEVELS) for (const r of nearRows(L)) {
    const g = groundOf(r.hunt);
    for (const tier of T.tiersOf(g)) for (let s = 0; s < SEEDS; s++) {
      jobs.push({ id: idOf(L, g, tier, s), ground: g, party: PARTY, level: PARTY.map(() => L), hours: HOURS, seeds: 1, seedBase: s, ...tierOpts(g, tier, PARTY.length), ...stagedGear(g),
        ...(PROFILE === 'played' ? { profile: 'played' } : {}) });
    }
  }
  return jobs;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const k = (x) => (Math.round(x / 100) / 10).toFixed(1) + 'k';

function report(played) {
  console.log('party-advice-table: ' + PARTY.join(' + ') + ', every seat at the Level, the ' + PROFILE + ' hero; ' + SEEDS + ' seeds x ' + HOURS + ' h a cell; a head\'s Level XP an hour (deaths, a head\'s profit an hour)');
  let off = 0;
  for (const L of LEVELS) {
    const lines = [];
    for (const r of nearRows(L)) {
      const g = groundOf(r.hunt);
      for (const tier of T.tiersOf(g)) {
        const cells = [...Array(SEEDS).keys()].map((s) => played.get(idOf(L, g, tier, s)));
        const head = mean(cells.map((c) => mean(c.heroes.map((h) => h.levelXpPerH))));
        const deaths = cells.reduce((n, c) => n + c.heroes.reduce((m, h) => m + h.deaths, 0), 0);
        const profit = mean(cells.map((c) => mean(c.heroes.map((h) => h.profitPerH))));
        lines.push({ hunt: r.hunt, g, tier, head, deaths, profit, band: r.band });
      }
    }
    const rec = recommendation(PARTY.map(() => L), PARTY.length, ROWS);
    const safe = lines.filter((x) => x.deaths === 0);
    const top = (l) => (l.length ? l.reduce((m, x) => (x.head > m.head ? x : m)) : null);
    const best = top(safe.length ? safe : lines);
    const advised = rec.row ? top((safe.length ? safe : lines).filter((x) => x.hunt === rec.row.hunt)) : null;
    const share = advised ? advised.head / best.head : 0;
    const agree = share >= WITHIN;
    if (!agree) off++;
    console.log('Level ' + L + ': the advice names ' + (rec.row ? rec.row.name : 'nothing') + (rec.note ? ' (with a note)' : '') + ', its best ' + (advised ? T.TIER_NAME[advised.tier] + ' ' + k(advised.head) : 'none')
      + '; best with no death: ' + (ROWS.find((x) => x.hunt === best.hunt) || {}).name + ' (' + T.TIER_NAME[best.tier] + ') ' + k(best.head) + ' = ' + Math.round(share * 100) + '%' + (agree ? '  AGREES' : '  OFF'));
    for (const x of lines) {
      console.log('  ' + x.g.padEnd(20) + ' ' + (x.band.join('-')).padEnd(7) + ' ' + T.TIER_NAME[x.tier].padEnd(10) + ' ' + k(x.head).padStart(7)
        + '  (' + x.deaths + ' deaths, ' + Math.round(x.profit) + ' g/h)' + (x === best ? '  <- best' : '') + (x === advised ? '  <- the advice\'s best' : ''));
    }
  }
  console.log(off ? off + ' Level(s) where the advice pays under ' + Math.round(WITHIN * 100) + '% of the best' : 'the advice names a ground paying at least ' + Math.round(WITHIN * 100) + '% of the best at every Level played');
  return off;
}

async function main() {
  const jobs = plan();
  const cache = arg('--cache', null);
  const tmp = cache ? null : mkdtempSync(join(tmpdir(), 'party-advice-'));
  const out = cache || join(tmp, 'cells.jsonl');
  try {
    const res = await runPool(jobs, out, { root: ROOT, workers: WORKERS, cpuMax: 101, log: () => {} });
    if (res.failed) { console.log('  ' + res.failed + ' cell(s) failed'); process.exitCode = 2; return; }
    const played = new Map(readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => { const c = JSON.parse(l); return [c.id, c]; }));
    const missing = jobs.filter((j) => !played.has(j.id));
    if (missing.length) { console.log('  ' + missing.length + ' cell(s) not played'); process.exitCode = 2; return; }
    process.exitCode = report(played) ? 1 : 0;
  } finally { if (tmp) rmSync(tmp, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e); process.exit(2); });
