#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/experiments.mjs — THE BALANCE LAB'S EXPERIMENT RECORDS (Balance Lab phase 2; docs/design/redesign/07-balance-lab.md
// section 3.4 "Experiment records": the question, the hypothesis, the candidate, the scenario and budget, the result file's hash, the
// conclusion, and who reviewed it. "An experiment with no hypothesis written before the run is refused").
//
//   node tools/balance-program/experiments.mjs --list
//   node tools/balance-program/experiments.mjs --new <EX-nnnn> --title "..." --question "..." --hypothesis "..." [--candidate <patch file or id>]
//        writes tools/balance-program/experiments/<EX-nnnn>.json, open, the hypothesis stamped now. Run the experiment AFTER this
//   node tools/balance-program/experiments.mjs --result <EX-nnnn> <file> --what "..." [--summary <json file>]
//        attaches a result: the file's sha256 and the instant it was made (a results file's own `at`, else its mtime); a result made before
//        the hypothesis was written is refused
//   node tools/balance-program/experiments.mjs --close <EX-nnnn> --conclusion "..." [--reviewer <who>]
//   node tools/balance-program/experiments.mjs --check      every record well formed; every result after its hypothesis; a closed record has a
//                                                            result and a conclusion; a result file that is present still hashes to its record
//   node tools/balance-program/experiments.mjs --selftest   every planted fault is caught, and the real records pass
//
// A result file may live outside the repository (a scratch folder: results are megabytes); its hash and its summary stay in the record, and
// --check verifies the hash whenever the file is present. A builder never reviews their own experiment (CLAUDE.md section 10): `reviewedBy`
// stays null until another agent or a person reads it.
//
// Exit: 0 ok · 1 a --check or --selftest failure · 2 a bad argument or a refused write.
// mutant-anchors: none — --selftest plants in-memory records; no tracked file is patched
// ci-step: economy-selftests | Balance Lab experiment records - a missing hypothesis, a result older than its hypothesis, a closed record with no conclusion and a moved result file are each refused
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/experiments.mjs --selftest
// ci-run: node tools/balance-program/experiments.mjs --check
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isMain } from '../../tests/_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const EXPERIMENT_DIR = join(HERE, 'experiments');
export const EXPERIMENT_SCHEMA = 'hearthrise.balance-experiment/1';
const ID = /^EX-\d{4}$/;
const ISO = /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;

export const sha256Of = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const fileOf = (id) => join(EXPERIMENT_DIR, id + '.json');
const abs = (f) => (isAbsolute(f) ? f : join(ROOT, f));

/** Every problem with one record, as strings (empty = good). `o.files`: check result hashes of files that are present (default true). */
export function validateRecord(r, o = {}) {
  const out = [], at = (r && r.id) || '(no id)';
  if (!r || typeof r !== 'object') return ['not an object'];
  if (r.schema !== EXPERIMENT_SCHEMA) out.push(at + ': schema ' + r.schema);
  if (!ID.test(r.id || '')) out.push(at + ': bad id');
  for (const k of ['title', 'question', 'hypothesis']) if (typeof r[k] !== 'string' || !r[k].trim()) out.push(at + ': no ' + k);
  if (!ISO.test(r.hypothesisAt || '')) out.push(at + ': hypothesisAt ' + r.hypothesisAt + ' is not an instant');
  if (!['open', 'closed'].includes(r.status)) out.push(at + ': status ' + r.status);
  if (!Array.isArray(r.results)) { out.push(at + ': no results list'); return out; }
  for (const [i, x] of r.results.entries()) {
    const w = at + ': result ' + (i + 1);
    if (!/^[0-9a-f]{64}$/.test(x.sha256 || '')) out.push(w + ': no sha256');
    if (!ISO.test(x.at || '')) out.push(w + ': at ' + x.at + ' is not an instant');
    else if (ISO.test(r.hypothesisAt || '') && Date.parse(x.at) < Date.parse(r.hypothesisAt)) out.push(w + ': made at ' + x.at + ', before the hypothesis was written (' + r.hypothesisAt + ')');
    if (typeof x.what !== 'string' || !x.what.trim()) out.push(w + ': says nothing of what it is');
    if (o.files !== false && x.file && existsSync(abs(x.file)) && sha256Of(abs(x.file)) !== x.sha256) out.push(w + ': ' + x.file + ' no longer hashes to the record');
  }
  if (r.status === 'closed') {
    if (!r.results.length) out.push(at + ': closed with no result');
    if (typeof r.conclusion !== 'string' || !r.conclusion.trim()) out.push(at + ': closed with no conclusion');
  } else if (r.conclusion) out.push(at + ': a conclusion on an open record');
  if (r.reviewedBy !== null && r.reviewedBy !== undefined && (typeof r.reviewedBy !== 'string' || r.reviewedBy === r.author)) out.push(at + ': reviewed by its own author');
  /* plain English (the targets' rule): no semicolons and no em dashes in the words */
  for (const k of ['title', 'question', 'hypothesis', 'conclusion']) if (typeof r[k] === 'string' && (r[k].includes(';') || r[k].includes('—'))) out.push(at + ': ' + k + ' has a semicolon or an em dash');
  return out;
}

export function readRecords(dir = EXPERIMENT_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => ID.test(f.replace(/\.json$/, '')) && f.endsWith('.json')).sort().map((f) => ({ file: f, record: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
}
export function checkAll(dir = EXPERIMENT_DIR) {
  const out = [];
  for (const { file, record } of readRecords(dir)) {
    if (file !== record.id + '.json') out.push(file + ': holds ' + record.id);
    out.push(...validateRecord(record));
  }
  return out;
}

const write = (r) => writeFileSync(fileOf(r.id), JSON.stringify(r, null, 1) + '\n');
const read = (id) => { if (!existsSync(fileOf(id))) throw new Error('no record ' + id); return JSON.parse(readFileSync(fileOf(id), 'utf8')); };
/** When a result was made: a results file's own `at` (readers.mjs --play), else the file's last write. */
function madeAt(file) {
  try { const d = JSON.parse(readFileSync(file, 'utf8')); if (d && ISO.test(d.at || '')) return d.at; } catch { /* not JSON, or not ours */ }
  return statSync(file).mtime.toISOString();
}

/* ── THE SELFTEST ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function selftest() {
  const fails = [];
  const good = { schema: EXPERIMENT_SCHEMA, id: 'EX-9999', title: 't', author: 'lane/x', question: 'q', hypothesis: 'h', hypothesisAt: '2026-11-21T10:00:00Z', candidate: null, scenario: null,
    results: [{ file: null, sha256: 'a'.repeat(64), at: '2026-11-21T11:00:00Z', what: 'w', summary: {} }], conclusion: 'c', concludedAt: '2026-11-21T12:00:00Z', reviewedBy: null, status: 'closed' };
  const c = () => JSON.parse(JSON.stringify(good));
  if (validateRecord(good).length) fails.push('CONTROL: a good record was refused: ' + validateRecord(good).join(' | '));
  const plants = [
    ['no hypothesis', /no hypothesis/, (r) => { r.hypothesis = ''; }],
    ['a result made before the hypothesis', /before the hypothesis was written/, (r) => { r.results[0].at = '2026-11-21T09:00:00Z'; }],
    ['a closed record with no conclusion', /closed with no conclusion/, (r) => { r.conclusion = null; }],
    ['a closed record with no result', /closed with no result/, (r) => { r.results = []; }],
    ['a conclusion on an open record', /a conclusion on an open record/, (r) => { r.status = 'open'; }],
    ['a result with no hash', /no sha256/, (r) => { r.results[0].sha256 = 'x'; }],
    ['a hypothesis stamped with no instant', /not an instant/, (r) => { r.hypothesisAt = 'yesterday'; }],
    ['a record reviewed by its author', /reviewed by its own author/, (r) => { r.reviewedBy = 'lane/x'; }],
    ['a semicolon in the words', /semicolon/, (r) => { r.question = 'a; b'; }],
  ];
  for (const [name, re, plant] of plants) { const r = c(); plant(r); const got = validateRecord(r); if (!got.some((s) => re.test(s))) fails.push('NOT CAUGHT: ' + name + (got.length ? ' (got ' + got[0] + ')' : '')); }
  /* a moved result file: hash this file, then claim another hash for it */
  const self = fileURLToPath(import.meta.url);
  const r = c(); r.results[0].file = self; r.results[0].sha256 = sha256Of(self);
  if (validateRecord(r).length) fails.push('CONTROL: a result file that still hashes was refused');
  r.results[0].sha256 = 'b'.repeat(64);
  if (!validateRecord(r).some((s) => /no longer hashes/.test(s))) fails.push('NOT CAUGHT: a result file that moved');
  const real = checkAll();
  if (real.length) fails.push('the real records fail: ' + real.slice(0, 3).join(' | '));
  for (const f of fails) console.error('FAIL ' + f);
  console.log('experiments selftest: ' + (plants.length + 4) + ' cases, ' + fails.length + ' failed');
  return fails.length ? 1 : 0;
}

/* ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const has = (k) => argv.includes('--' + k);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
function main() {
  if (has('selftest')) return selftest();
  if (has('check')) { const bad = checkAll(); for (const b of bad) console.error('BAD  ' + b); console.log('experiments: ' + readRecords().length + ' record(s), ' + bad.length + ' problem(s)'); return bad.length ? 1 : 0; }
  if (has('list')) { for (const { record: r } of readRecords()) console.log(r.id + '  ' + r.status.padEnd(7) + r.results.length + ' result(s)  ' + r.title); return 0; }
  if (has('new')) {
    const id = arg('new');
    if (!ID.test(id || '')) throw new Error('--new EX-nnnn');
    if (existsSync(fileOf(id))) throw new Error(id + ' exists');
    const r = { schema: EXPERIMENT_SCHEMA, id, title: arg('title'), author: arg('author', 'lane/lab-p2-readers'), question: arg('question'), hypothesis: arg('hypothesis'), hypothesisAt: new Date().toISOString(),
      candidate: arg('candidate'), scenario: arg('scenario') ? JSON.parse(arg('scenario')) : null, results: [], conclusion: null, concludedAt: null, reviewedBy: null, status: 'open' };
    const bad = validateRecord(r);
    if (bad.length) { for (const b of bad) console.error('REFUSED  ' + b); return 2; }
    write(r); console.log('wrote ' + fileOf(id) + ': run the experiment now');
    return 0;
  }
  if (has('result')) {
    const i = argv.indexOf('--result'), id = argv[i + 1], file = argv[i + 2];
    const r = read(id);
    if (!file || !existsSync(file)) throw new Error('--result EX-nnnn <file>');
    const x = { file: file.startsWith(ROOT) ? file.slice(ROOT.length + 1).replace(/\\/g, '/') : null, name: file.split(/[\\/]/).pop(), sha256: sha256Of(file), at: madeAt(file), what: arg('what'),
      summary: arg('summary') ? JSON.parse(readFileSync(arg('summary'), 'utf8')) : null };
    r.results.push(x);
    const bad = validateRecord(r);
    if (bad.length) { for (const b of bad) console.error('REFUSED  ' + b); return 2; }
    write(r); console.log(id + ': result ' + r.results.length + ' ' + x.sha256.slice(0, 12) + ' (' + x.at + ')');
    return 0;
  }
  if (has('close')) {
    const r = read(arg('close'));
    Object.assign(r, { conclusion: arg('conclusion'), concludedAt: new Date().toISOString(), status: 'closed', ...(arg('reviewer') ? { reviewedBy: arg('reviewer') } : {}) });
    const bad = validateRecord(r);
    if (bad.length) { for (const b of bad) console.error('REFUSED  ' + b); return 2; }
    write(r); console.log(r.id + ': closed');
    return 0;
  }
  console.error('experiments.mjs: --list | --new | --result | --close | --check | --selftest');
  return 2;
}
if (isMain(import.meta.url)) { let c; try { c = main(); } catch (e) { console.error('experiments.mjs: ' + e.message); c = 2; } process.exit(c); }
