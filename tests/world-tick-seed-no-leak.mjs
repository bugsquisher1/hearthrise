#!/usr/bin/env node
// ============================================================================
// tests/world-tick-seed-no-leak.mjs — A PROBE'S STORED SEED NEVER LEAVES THE READ
//
//   node tests/world-tick-seed-no-leak.mjs            the guard
//   node tests/world-tick-seed-no-leak.mjs --mutate   every planted leak must go RED
//
// SEC_PROBE_RETAIN_2026-10-06 condition (ii). hr_tick_probe.seed is the one-span
// draw of hr_seed at the span-start label. The shadow chain starts at
// ps.accrued_to, so a probe's span_from can equal an away player's live
// watermark, and then the stored seed IS the seed of that player's NEXT live
// settle (the "past watermark" sentence in 2026-10-07-probe-retain-input.sql's
// header is wrong; WORLD_TICK_DESIGN.md §20). It is secret-equivalent: never
// printed, exported, written to a fixture, or sent to CI.
//
//   SL-1  the evaluator (tools/world-tick-parity.mjs) and the replay/bar modules
//         it hands rows to: no console/stdout/stderr call names a seed outside
//         a string literal; the evaluator writes no file and never serialises a
//         whole row.
//   SL-2  fixtures: no JSON under tests/ or services/ is a probe-row with a seed,
//         and no NEW `seed` key appears in the world-tick fixtures (the six
//         synthetic ones predate the column, 2026-09-16/18, and are pinned).
//   SL-3  provenance: no other file that can reach production (token or
//         management endpoint) reads hr_tick_probe — the evaluator is the only
//         reader, so no other test or tool can pick a seed up.
//   SL-4  CI: every workflow call of the evaluator is --selftest, and the
//         evaluator itself refuses its production read under CI.
//   SL-5  RUNTIME: twelve retained rows (stored input + stored seed; six that
//         reproduce, six that do not, so the FAIL path's reasons print) through
//         the evaluator's own productionReplayOf -> readVerdict -> printRead
//         (verbose). No seed, in decimal, hex or signed form, appears in the
//         captured output or in the serialised verdict.
//
// No network, no database, no credential. Exit: 0 green (or, under --mutate,
// every mutant red) · 1 red · 2 harness.
// ============================================================================

import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const EVALUATOR = 'tools/world-tick-parity.mjs';
const PRINT_SCOPE = [EVALUATOR, 'services/world-tick/parity-replay.js', 'services/world-tick/parity-bar.js'];

/* The six synthetic fixture seeds that predate hr_tick_probe.seed (shadow
   fixtures, c1a72a5b 2026-09-16 / eeb331aa 2026-09-18). Pinned: a new one is red. */
const FIXTURE_SEEDS = Object.freeze({
  'services/world-tick/fixtures/characters.json': [1592269876, 305419896, 2596069104],
  'services/world-tick/fixtures/gather-sessions.json': [918273645, 55512345, 7654321],
});
const SEED_KEY = /^(seed|span_?seed|one_?span_?seed|probe_?seed)$/i;
const PROBE_ROW_KEYS = ['span_from', 'payload_open', 'payload_close', 'input_trimmed_at', 'void_reason'];

const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');
function walk(dir, exts, out = []) {
  let names;
  try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => n.endsWith(e))) out.push(p);
  }
  return out;
}
function loadFiles() {
  const files = new Map();
  for (const d of ['tools', 'tests', 'scripts', 'services']) {
    for (const p of walk(join(ROOT, d), ['.mjs', '.js', '.json'])) files.set(rel(p), readFileSync(p, 'utf8'));
  }
  files.set('.github/workflows/smoke.yml', readFileSync(join(ROOT, '.github', 'workflows', 'smoke.yml'), 'utf8'));
  return files;
}

// ── SL-1: print calls, with string-literal text removed ─────────────────────
/* The code inside one call's parentheses, string literals blanked except the
   expressions inside template ${...}. */
function callCode(src, open) {
  let i = open; let depth = 0; let code = '';
  const stack = [];          // template nesting: depth at which a ${ opened
  let mode = null;           // null | "'" | '"' | '`'
  for (; i < src.length; i++) {
    const c = src[i];
    if (mode === "'" || mode === '"') {
      if (c === '\\') { i++; continue; }
      if (c === mode) mode = null;
      continue;
    }
    if (mode === '`') {
      if (c === '\\') { i++; continue; }
      if (c === '`') { mode = null; continue; }
      if (c === '$' && src[i + 1] === '{') { stack.push(depth); mode = null; i++; depth++; code += ' '; }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { mode = c; code += ' '; continue; }
    if (c === '(' || c === '{' || c === '[') depth++;
    if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (c === '}' && stack.length && stack[stack.length - 1] === depth) { stack.pop(); mode = '`'; continue; }
      if (depth === 0) break;
    }
    code += c;
  }
  return code;
}
export function printLeaks(src) {
  const out = [];
  const re = /\b(console\.(?:log|error|warn|info|debug)|process\.(?:stdout|stderr)\.write)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const code = callCode(src, m.index + m[0].length - 1);
    if (/\bseed\b|\bseedOfRow\b|\.seed\b/.test(code)) {
      out.push(`line ${src.slice(0, m.index).split('\n').length}: ${m[1]}(…) names a seed: ${code.replace(/\s+/g, ' ').slice(0, 120)}`);
    }
  }
  return out;
}
function sl1(files) {
  const bad = [];
  for (const f of PRINT_SCOPE) {
    const src = files.get(f);
    if (src === undefined) { bad.push(`${f} is missing`); continue; }
    for (const l of printLeaks(src)) bad.push(`${f} ${l}`);
  }
  const ev = files.get(EVALUATOR) || '';
  const w = ev.match(/\b(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|writeSync)\b/);
  if (w) bad.push(`${EVALUATOR} uses ${w[1]} — the evaluator writes no file`);
  const s = ev.match(/JSON\.stringify\(\s*(rows?|body)\b/);
  if (s) bad.push(`${EVALUATOR} serialises a whole ${s[1]} (JSON.stringify(${s[1]}…)) — a row carries its seed`);
  return bad;
}

// ── SL-2: fixtures ──────────────────────────────────────────────────────────
function sl2(files) {
  const bad = [];
  for (const [f, text] of files) {
    if (!f.endsWith('.json') || !(f.startsWith('tests/') || f.startsWith('services/'))) continue;
    let doc;
    try { doc = JSON.parse(text); } catch { continue; }
    const seeds = [];
    const visit = (v, path) => {
      if (Array.isArray(v)) { v.forEach((x, i) => visit(x, `${path}[${i}]`)); return; }
      if (!v || typeof v !== 'object') return;
      const keys = Object.keys(v);
      const seedKeys = keys.filter((k) => SEED_KEY.test(k) && v[k] !== null && v[k] !== undefined);
      if (seedKeys.length && keys.some((k) => PROBE_ROW_KEYS.includes(k))) {
        bad.push(`${f} ${path}: a probe-shaped row (${keys.filter((k) => PROBE_ROW_KEYS.includes(k)).join(', ')}) carries ${seedKeys.join(', ')}`);
      }
      for (const k of seedKeys) if (/^-?\d+$/.test(String(v[k]))) seeds.push({ at: `${path}.${k}`, v: Number(v[k]) });
      for (const k of keys) visit(v[k], `${path}.${k}`);
    };
    visit(doc, '$');
    const fixture = f.startsWith('services/world-tick/fixtures/') || /^tests\/(.*\/)?fixtures\//.test(f);
    if (!fixture) continue;
    const allowed = new Set(FIXTURE_SEEDS[f] || []);
    for (const s of seeds) {
      if (!allowed.has(s.v)) bad.push(`${f} ${s.at} = ${'<redacted>'}: a seed in a fixture that is not one of the pinned pre-column synthetic seeds`);
    }
  }
  return bad;
}

// ── SL-3: provenance ────────────────────────────────────────────────────────
function sl3(files) {
  const bad = [];
  for (const [f, text] of files) {
    if (f === EVALUATOR || f === 'tests/world-tick-seed-no-leak.mjs' || f.endsWith('.json')) continue;
    const prod = /supabase-token|api\.supabase\.com/.test(text);
    if (prod && /\bhr_tick_probe\b/.test(text)) {
      bad.push(`${f} can reach production AND names hr_tick_probe — ${EVALUATOR} is the only reader of the probe's seed`);
    }
  }
  return bad;
}

// ── SL-4: CI ────────────────────────────────────────────────────────────────
function sl4(files, opts) {
  const bad = [];
  const yml = files.get('.github/workflows/smoke.yml') || '';
  yml.split('\n').forEach((line, i) => {
    if (/^\s*#/.test(line) || !/world-tick-parity\.mjs/.test(line) || !/\bnode\b/.test(line)) return;
    if (/tests\/world-tick-parity\.mjs/.test(line)) return;          // the fixture guard, a different file
    if (!/--selftest\b/.test(line)) bad.push(`smoke.yml:${i + 1} runs the evaluator's PRODUCTION read in CI: ${line.trim()}`);
  });
  if (opts && opts.spawn) {
    const r = spawnSync(process.execPath, [join(ROOT, EVALUATOR), '--days', '1'], {
      cwd: ROOT, encoding: 'utf8', timeout: 60000, env: Object.assign({}, process.env, { CI: 'true' }),
    });
    if (r.status !== 2 || !/never runs in CI/.test(r.stderr || '')) {
      bad.push(`${EVALUATOR} under CI=true did not refuse its production read (exit ${r.status})`);
    }
  }
  return bad;
}

// ── SL-5: runtime ───────────────────────────────────────────────────────────
const H = 'c'.repeat(64);
let ROWS = null;
async function retainedRows() {
  if (ROWS) return ROWS;
  const ev = await import(pathToFileURL(join(ROOT, EVALUATOR)).href);
  const { oneSpan, probeResultOf, encodeProbeInput } =
    await import(pathToFileURL(join(ROOT, 'supabase/functions/hr-accrue/tick-probe.js')).href);
  const { offlineSeedFor } = await import(pathToFileURL(join(ROOT, 'services/world-tick/combat.js')).href);
  const iso = (ms) => new Date(ms).toISOString().replace('Z', '+00:00');
  const seeds = [];
  const rows = ev.selftestProbes().map((p, i) => {
    const own = offlineSeedFor(p.input.userId, p.input.slot, p.input.accruedToText);
    const result = probeResultOf(oneSpan('combat', p.input, p.fromMs, p.toMs, own));
    /* Half store the probe's own seed (reproduces), half a different one (does
       not), so both the PASS path and the FAIL path's printed reasons run. */
    const seed = i < 6 ? own : ((own ^ 0x5a5a5a5a) >>> 0);
    seeds.push(seed);
    const xp = Object.values(result.xp || {}).reduce((a, v) => a + v, 0);
    return {
      id: 700 + i, user_id: 'u-seed-leak', slot: 0, channel: 'combat', status: 'closed', void_reason: null,
      span_from: iso(p.fromMs), span_to: iso(p.toMs), base_version: 3, version_close: 3,
      payload_open: H, payload_close: H, result, input: JSON.parse(JSON.stringify(encodeProbeInput(p.input))),
      seed: String(seed), input_trimmed_at: null,
      n: 160, first_from: iso(p.fromMs), last_to: iso(p.toMs), covered_s: (p.toMs - p.fromMs) / 1000,
      breaks: 0, straddles: 0, off_version: 0, gold: result.gold, qty: 0, ticks: result.ticks, kills: result.kills,
      ate: result.ate, deaths: result.deaths, recover_texts: null, xp: { attack: xp }, items: result.items, ledger_rows: 0,
    };
  });
  ROWS = { rows, seeds };
  return ROWS;
}
const forms = (s) => {
  const n = Number(s);
  return [String(n), n.toString(16), (n | 0).toString(), `0x${n.toString(16)}`];
};
async function sl5(evUrl) {
  const bad = [];
  const ev = await import(evUrl);
  const { rows, seeds } = await retainedRows();
  const out = [];
  const keep = { log: console.log, error: console.error, warn: console.warn, info: console.info,
    o: process.stdout.write, e: process.stderr.write };
  const cap = (...a) => { out.push(a.map(String).join(' ')); };
  console.log = cap; console.error = cap; console.warn = cap; console.info = cap;
  process.stdout.write = (c) => { out.push(String(c)); return true; };
  process.stderr.write = (c) => { out.push(String(c)); return true; };
  let v;
  try {
    v = ev.readVerdict(rows.map((r) => JSON.parse(JSON.stringify(r))), H, { replayOf: ev.productionReplayOf(H, 2) });
    ev.printRead(v, H, { verbose: true });
  } finally {
    console.log = keep.log; console.error = keep.error; console.warn = keep.warn; console.info = keep.info;
    process.stdout.write = keep.o; process.stderr.write = keep.e;
  }
  const printed = out.join('\n');
  const exported = JSON.stringify(v);
  /* Non-vacuity: the seeds were USED (six reproduce, six do not) and the FAIL
     path's reasons were printed. */
  const reps = v.records.map((r) => r.replay && r.replay.reproduced);
  const nTrue = reps.filter((x) => x === true).length;
  const nFalse = reps.filter((x) => x === false).length;
  if (nTrue !== 6 || nFalse !== 6) bad.push(`harness: expected 6 reproduced / 6 not, got ${nTrue} / ${nFalse}`);
  if (!/does not reproduce/.test(printed)) bad.push('harness: the non-reproducing rows printed no reason — the FAIL path was not exercised');
  for (const s of seeds) {
    for (const f of forms(s)) {
      if (f.length >= 6 && printed.includes(f)) { bad.push(`a stored seed is PRINTED by the read (form ${f.length} chars)`); break; }
    }
    for (const f of forms(s)) {
      if (f.length >= 6 && exported.includes(f)) { bad.push(`a stored seed is in the read's verdict object (form ${f.length} chars)`); break; }
    }
  }
  return bad;
}

// ── mutants ─────────────────────────────────────────────────────────────────
const EV_SRC = () => readFileSync(join(ROOT, EVALUATOR), 'utf8');
const MARK_DECODE = '    const input = decodeProbeInput(row.input);';
const MARK_RETURN = '    return Object.assign(r.stats, { reproduceDetail: r.reproduceDetail });';
function editEv(edits) {
  let s = EV_SRC();
  for (const [a, b] of edits) {
    if (!s.includes(a)) { console.error(`--mutate: marker gone from ${EVALUATOR} — "${a.trim()}"`); process.exit(2); }
    s = s.split(a).join(b);
  }
  return s;
}
/* A mutated evaluator, importable from the OS temp dir (relative imports made absolute). */
function evModule(src, tag) {
  const base = pathToFileURL(ROOT).href.replace(/\/$/, '');
  /* Every relative import made absolute: '../x' from the repo root, './x'
     (pack-edge.mjs, world-tick-replay-pool.mjs) from tools/. */
  const abs = src.split("'../").join(`'${base}/`).split("'./").join(`'${base}/tools/`);
  const p = join(tmpdir(), `hr-seed-leak-${process.pid}-${tag}.mjs`);
  writeFileSync(p, abs, 'utf8');
  return { url: pathToFileURL(p).href, done: () => { try { unlinkSync(p); } catch { /* gone */ } } };
}
const MUTANTS = [
  { name: 'SL-M1 the replay prints the row\'s seed', want: ['SL-1', 'SL-5'],
    ev: [[MARK_DECODE, `${MARK_DECODE}\n    console.log(\`  probe \${row.id} seed \${row.seed}\`);`]] },
  { name: 'SL-M2 the replay record exports the seed (no print)', want: ['SL-5'],
    ev: [[MARK_RETURN, '    return Object.assign(r.stats, { reproduceDetail: r.reproduceDetail, seed: seedOfRow(row) });']] },
  { name: 'SL-M3 the evaluator dumps its rows to a file', want: ['SL-1'],
    ev: [[MARK_DECODE, `${MARK_DECODE}\n    if (process.env.HR_DUMP) writeFileSync('probe-rows.json', JSON.stringify(row));`]] },
  { name: 'SL-M4 a probe row (with seed) saved as a fixture', want: ['SL-2'],
    files: (m) => m.set('services/world-tick/fixtures/probe-dump.json', JSON.stringify(
      [{ id: 8, span_from: '2026-10-06T08:39:48+00:00', payload_open: H, seed: 123456789 }])) },
  { name: 'SL-M5 a new bare seed in a world-tick fixture', want: ['SL-2'],
    files: (m) => m.set('services/world-tick/fixtures/characters.json',
      m.get('services/world-tick/fixtures/characters.json').replace('"seed": 305419896', '"seed": 305419897')) },
  { name: 'SL-M6 CI runs the production read', want: ['SL-4'],
    files: (m) => m.set('.github/workflows/smoke.yml',
      `${m.get('.github/workflows/smoke.yml')}\n          node tools/world-tick-parity.mjs --days 4\n`) },
  { name: 'SL-M7 a second tool reads the probe table from production', want: ['SL-3'],
    files: (m) => m.set('tools/probe-peek.mjs',
      "const t = readFileSync(join(homedir(), '.supabase-token'));\nconst q = 'select seed from public.hr_tick_probe';\n") },
];

async function runAll(files, evUrl, opts) {
  const red = {};
  const add = (id, list) => { if (list.length) red[id] = list; };
  add('SL-1', sl1(files));
  add('SL-2', sl2(files));
  add('SL-3', sl3(files));
  add('SL-4', sl4(files, opts));
  if (!opts || opts.runtime !== false) add('SL-5', await sl5(evUrl));
  return red;
}

async function main() {
  const files = loadFiles();
  const evUrl = pathToFileURL(join(ROOT, EVALUATOR)).href;
  if (!MUTATE) {
    console.log('world-tick-seed-no-leak: a probe\'s stored seed never leaves the read');
    const red = await runAll(files, evUrl, { spawn: true });
    for (const id of ['SL-1', 'SL-2', 'SL-3', 'SL-4', 'SL-5']) {
      if (red[id]) for (const r of red[id]) console.log(`  ✗ ${id} ${r}`);
      else console.log(`  ✓ ${id}`);
    }
    const n = Object.values(red).reduce((a, l) => a + l.length, 0);
    console.log(n ? `world-tick-seed-no-leak: RED (${n})` : 'world-tick-seed-no-leak: green');
    process.exit(n ? 1 : 0);
  }
  console.log('world-tick-seed-no-leak --mutate');
  let escaped = 0;
  let i = 0;
  for (const m of MUTANTS) {
    const fm = new Map(files);
    let mod = null;
    if (m.ev) {
      const src = editEv(m.ev);
      fm.set(EVALUATOR, src);
      mod = evModule(src, i++);
    }
    if (m.files) m.files(fm);
    let red;
    try {
      red = await runAll(fm, mod ? mod.url : evUrl, { runtime: m.want.includes('SL-5') });
    } finally { if (mod) mod.done(); }
    const missed = m.want.filter((id) => !red[id]);
    const ok = missed.length === 0;
    console.log(`  ${ok ? 'caught ' : 'ESCAPED'}  ${m.name} -> ${m.want.join(' + ')}${ok ? '' : ` (${missed.join(', ')} stayed green)`}`);
    if (ok) console.log(`           ${m.want.map((id) => `${id}: ${red[id][0]}`).join(' | ').slice(0, 300)}`);
    else escaped++;
  }
  console.log(escaped ? `--mutate: ${escaped} mutant(s) ESCAPED` : '--mutate: every mutant caught');
  process.exit(escaped ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
