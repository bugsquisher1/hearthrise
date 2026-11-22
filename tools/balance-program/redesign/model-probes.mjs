#!/usr/bin/env node
// tools/balance-program/redesign/model-probes.mjs — EXPLORATORY: four model probes for docs/design/redesign/04-math-strategy.md
// (lane/rd-math, 2026-11-21). Nothing here is a guard and nothing here plays a fight: each probe is one patch of ./patches/ played by
// tools/balance-program/balance-matrix.mjs --diff on a scratch copy (the real engine, the same dice before and after).
//
//   node tools/balance-program/redesign/model-probes.mjs --run [--only 30,60,110] [--seeds 2] [--hours 1] [--out <dir>]
//        plays each probe and writes <dir>/<probe>.json (the matrix's own --json) and ./model-probes.json (the summary below)
//   node tools/balance-program/redesign/model-probes.mjs --report [--out <dir>]
//        NO PLAY: the summary again from the <dir> files
//
// THE SUMMARY reads four kinds of cell at each Level: the lone hammer and the standard four, MID kit, on each tier.
//   A  atk-125            how much of +25% hero damage reaches Level XP an hour (an elasticity: ln(pace ratio) / ln(1.25))
//   B  mon-125            what +25% monster blows cost in pace, store gold and low health
//   C  rest-slow          rest at a tenth of today's rate: what a hunt pays in pace once damage taken costs time
//   D  rest-slow-mon-125  D against C: the pace cost of +25% monster blows when rest costs time
// Exit: 0 ran · 2 harness.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PROBES = ['atk-125', 'mon-125', 'rest-slow', 'rest-slow-mon-125'];
const OUT = resolve(arg('out', join(tmpdir(), 'hr-model-probes')));
const only = arg('only', '30,60,110');
const seeds = arg('seeds', '2');
const hours = arg('hours', '1');
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

if (has('run')) {
  mkdirSync(OUT, { recursive: true });
  for (const p of PROBES) {
    const file = join(OUT, p + '.json');
    process.stdout.write('probe ' + p + ' ... ');
    try {
      execFileSync(process.execPath, [join(ROOT, 'tools/balance-program/balance-matrix.mjs'), '--diff', join(HERE, 'patches', p + '.json'),
        '--subset', '--only', only, '--seeds', seeds, '--hours', hours, '--json', file], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
    } catch (e) {
      /* --diff exits 1 on a tool red or a failed gate: the JSON is still the reading */
      if (!existsSync(file)) { console.error('\n' + p + ' wrote nothing: ' + String(e.stderr || e.message).slice(-2000)); process.exit(2); }
    }
    console.log('done');
  }
}
if (!has('run') && !has('report')) { console.log('usage: --run | --report (see the header)'); process.exit(0); }

const load = (p) => { const f = join(OUT, p + '.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const docs = Object.fromEntries(PROBES.map((p) => [p, load(p)]));
if (!docs['atk-125']) { console.error('no probe output in ' + OUT); process.exit(2); }
const cellMap = (d) => new Map((d ? d.cells : []).map((c) => [c.key, c]));
const maps = Object.fromEntries(PROBES.map((p) => [p, cellMap(docs[p])]));
const WANT = /^(\d+)\|mid\|(1:h|4:hbmh)\|(normal|dangerous|deadly)$/;
const m = (c, k, i) => (c && c.metrics[k] ? c.metrics[k][i] : null);
const ratio = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b ? a / b : null);
const rows = [];
for (const [key, a] of maps['atk-125']) {
  const hit = WANT.exec(key);
  if (!hit) continue;
  const b = maps['mon-125'].get(key), c = maps['rest-slow'].get(key), d = maps['rest-slow-mon-125'].get(key);
  const kills = m(a, 'killsPerH', 0), ttk = m(a, 'ttkS', 0);
  const paceA = ratio(m(a, 'levelXpPerH', 1), m(a, 'levelXpPerH', 0));
  rows.push({
    key, L: Number(hit[1]), party: hit[2] === '1:h' ? 'lone hammer' : 'four', tier: hit[3], ground: a.ground,
    today: { killsPerH: kills, ttkS: ttk, fightShare: hit[2] === '1:h' ? r3((kills * ttk) / 3600) : null, lowHpTypical: m(a, 'lowHpTypical', 0), deathsPer1000h: m(a, 'deathsPer1000h', 0), storePerH: m(a, 'storePerH', 0), takenPerH: m(a, 'takenPerH', 0) },
    A: { pace: r3(paceA), elasticity: paceA > 0 ? r3(Math.log(paceA) / Math.log(1.25)) : null, taken: r3(ratio(m(a, 'takenPerH', 1), m(a, 'takenPerH', 0))) },
    B: b ? { pace: r3(ratio(m(b, 'levelXpPerH', 1), m(b, 'levelXpPerH', 0))), store: r3(ratio(m(b, 'storePerH', 1), m(b, 'storePerH', 0))), net: r3(ratio(m(b, 'netPerH', 1), m(b, 'netPerH', 0))), lowHp: [m(b, 'lowHpTypical', 0), m(b, 'lowHpTypical', 1)], deaths: [m(b, 'deathsPer1000h', 0), m(b, 'deathsPer1000h', 1)] } : null,
    C: c ? { pace: r3(ratio(m(c, 'levelXpPerH', 1), m(c, 'levelXpPerH', 0))), store: r3(ratio(m(c, 'storePerH', 1), m(c, 'storePerH', 0))), lowHp: [m(c, 'lowHpTypical', 0), m(c, 'lowHpTypical', 1)], deaths: [m(c, 'deathsPer1000h', 0), m(c, 'deathsPer1000h', 1)] } : null,
    DoverC: c && d ? { pace: r3(ratio(m(d, 'levelXpPerH', 1), m(c, 'levelXpPerH', 1))), store: r3(ratio(m(d, 'storePerH', 1), m(c, 'storePerH', 1))), lowHp: [m(c, 'lowHpTypical', 1), m(d, 'lowHpTypical', 1)], deaths: [m(c, 'deathsPer1000h', 1), m(d, 'deathsPer1000h', 1)] } : null,
  });
}
rows.sort((x, y) => x.L - y.L || x.party.localeCompare(y.party) || x.tier.localeCompare(y.tier));
/* the armor step's worth in pace, today and under probe C: the lone hammer's MID cell against the same cell one armor state back */
const steps = [];
for (const L of [...new Set(rows.map((r) => r.L))]) {
  const base = L + '|mid|1:h|normal', step = base + '|step:armor';
  for (const [name, p, i] of [['today', 'rest-slow', 0], ['rest-slow', 'rest-slow', 1]]) {
    const x = maps[p].get(base), y = maps[p].get(step);
    if (x && y) steps.push({ L, tree: name, armorStepPace: r3(ratio(m(x, 'levelXpPerH', i), m(y, 'levelXpPerH', i))), armorStepTaken: r3(ratio(m(x, 'takenPerH', i), m(y, 'takenPerH', i))) });
  }
}
const summary = { schema: 'hearthrise.redesign-model-probes/1', run: { only, seeds: Number(seeds), hours: Number(hours), cells: 'the matrix subset' }, rows, armorSteps: steps };
writeFileSync(join(HERE, 'model-probes.json'), JSON.stringify(summary, null, 1) + '\n');
const pad = (s, n) => String(s == null ? '-' : s).padEnd(n);
console.log(pad('cell', 30) + pad('kills/h', 9) + pad('ttk s', 7) + pad('fight', 7) + pad('A pace', 8) + pad('A elast', 9) + pad('B pace', 8) + pad('B store', 9) + pad('C pace', 8) + pad('D/C pace', 10) + pad('D/C store', 10) + 'low C -> D');
for (const r of rows) console.log(pad(r.key, 30) + pad(r.today.killsPerH, 9) + pad(r.today.ttkS, 7) + pad(r.today.fightShare, 7) + pad(r.A.pace, 8) + pad(r.A.elasticity, 9) + pad(r.B && r.B.pace, 8) + pad(r.B && r.B.store, 9) + pad(r.C && r.C.pace, 8) + pad(r.DoverC && r.DoverC.pace, 10) + pad(r.DoverC && r.DoverC.store, 10) + (r.DoverC ? r.DoverC.lowHp.join(' -> ') : '-'));
for (const s of steps) console.log('armor step, Level ' + s.L + ' (' + s.tree + '): pace x' + s.armorStepPace + ', damage taken x' + s.armorStepTaken);
