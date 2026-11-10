#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/formula-single-source.mjs — ONE PLACE WHERE A FORMULA'S NUMBERS LIVE
//
//   node tests/formula-single-source.mjs             the guard
//   node tests/formula-single-source.mjs --report    the guard + every row and where its numbers live
//   node tests/formula-single-source.mjs --selftest  mutation proof: a planted second copy per rule goes red
//
// WHY (architecture audit 2026-11-09, S1; Tyler 2026-11-08: every formula is public, lives in ONE data source,
// and the wiki renders it from data). The sale formula was typed in the edge, its rates in two layers and a
// third time in src/data/shops.js, held together by a test that pinned the copies equal. A pin keeps copies
// equal; it does not make them one. src/data/formulas/registry.js is now the registry of every published formula,
// and this guard is what keeps each row's numbers in one place: the next person who types a rate into the
// file they happen to be in gets a red build with the file and line.
//
// WHAT IT ASSERTS, per row of FORMULAS
//   shape        id, title, expr, params, consts, evaluator are present and printable; params are frozen and
//                hold only numbers, strings, and lists or maps of them (a wiki cannot print a function)
//   one-home     every constant a row names is exported exactly ONCE in src/, the edge and tools/, from the
//                src/data file the row says
//   typed-again  no other place gives one of those constants (or a retired name, or a `keys` name) a number
//   core-clean   an evaluator under src/core/formulas types no number but 0, 1 and 1000 (floors and permille)
//   bound        the row's evaluator is exported where it says, EVALUATORS binds the id to that function, and
//                EVALUATORS holds no id without a row
//   reader       every file the row lists calls the evaluator (it does not work the number out again)
//   pending      PENDING, the known copies that wait for another lane, only shrinks: each entry still matches
//                exactly once, is still a copy, and the list never passes PENDING_CEILING
//
// Tests are not scanned: a test that pins a ruled number is an independent witness, which is its job.
// Exit 0 clean, 1 on a breach, 2 on a harness error.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src', 'supabase/functions', 'tools'];
const EVALUATOR_DIR = 'src/core/formulas/';
const REGISTRY = 'src/data/formulas/registry.js';
/* The numbers an evaluator may type: floors, "at least 1", and permille arithmetic. Anything else is tuning and is a data row. */
const STRUCTURAL = new Set(['0', '1', '1000']);

/* KNOWN COPIES THAT WAIT FOR ANOTHER LANE. Shrink-only: delete an entry when its copy is gone (the guard goes red until you do).
   `text` is where the copy starts, as typed. All four are src/data/shops.js DERIVED_PRICES, a table no code reads: lane/b-area-set
   edits its gear line (tiers 4-6), so deleting the table now would hand that lane a conflict. It goes in the first slice after
   area spells land (.claude/coordination/formula-home-2026-11-10.md, slice 9). */
const PENDING = [
  { file: 'src/data/shops.js', text: '"VENDOR_RAW_RATE": 0', why: 'DERIVED_PRICES restates the raw rate' },
  { file: 'src/data/shops.js', text: '"VENDOR_GEAR_RATES": [', why: 'DERIVED_PRICES restates the gear ladder' },
  { file: 'src/data/shops.js', text: '"VENDOR_HOURLY_ARMOR_T2_RATE": 0', why: 'DERIVED_PRICES restates the hourly armor rate' },
  { file: 'src/data/shops.js', text: '"SHOP_BUYBACK_RATE": 0', why: 'DERIVED_PRICES restates the buy-back cap' },
];
const PENDING_CEILING = 4;

class HarnessError extends Error {}
const posix = (p) => p.split('\\').join('/');

function readTree() {
  const files = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(dir, name), st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(js|mjs|ts)$/.test(name)) files.set(posix(relative(ROOT, p)), readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));
    }
  };
  for (const d of SCAN_DIRS) walk(join(ROOT, d));
  if (files.size < 300) throw new HarnessError('the scan is vacuous: ' + files.size + ' files');
  return files;
}

/* Comments out, layout kept (a hit's line number is the file's). */
const blank = (m) => m.replace(/[^\n]/g, ' ');
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, a) => a + blank(m.slice(a.length)));
const noStrings = (text) => text.replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, blank);
const lineOf = (text, i) => text.slice(0, i).split('\n').length;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Can a wiki print it? numbers, strings, and lists or maps of them, frozen all the way down. */
function printable(v, path, out) {
  if (typeof v === 'number') { if (!Number.isFinite(v)) out.push(path + ' is not a finite number'); return; }
  if (typeof v === 'string' || typeof v === 'boolean') return;
  if (v && typeof v === 'object') {
    if (!Object.isFrozen(v)) out.push(path + ' is not frozen');
    for (const k of Object.keys(v)) printable(v[k], path + '.' + k, out);
    return;
  }
  out.push(path + ' is a ' + (v === null ? 'null' : typeof v) + ', which a wiki cannot print');
}

/** Every breach as { rule, msg }. Pure: `files` is path -> text, so the selftest plants into a copy of the map. */
export function check({ files, formulas, evaluators, pending = PENDING, ceiling = PENDING_CEILING }) {
  const bad = [];
  const say = (rule, msg) => bad.push({ rule, msg });
  const code = new Map([...files].map(([f, t]) => [f, strip(t)]));
  const ids = new Set();
  const waived = new Set();
  const hits = [];

  for (const r of formulas) {
    const at = 'row ' + (r && r.id);
    if (!r || !/^[a-z_]+\.[a-z_]+$/.test(r.id || '')) { say('shape', at + ': the id is not <system>.<what>'); continue; }
    if (ids.has(r.id)) say('shape', at + ': the id is used twice');
    ids.add(r.id);
    if (typeof r.title !== 'string' || !r.title.trim()) say('shape', at + ': no title');
    if (!Array.isArray(r.expr) || !r.expr.length || r.expr.some((s) => typeof s !== 'string' || !s.trim())) say('shape', at + ': expr is not a list of lines');
    if (!r.params || typeof r.params !== 'object' || !Object.keys(r.params).length) say('shape', at + ': no params');
    else { const out = []; printable(r.params, 'params', out); for (const m of out) say('shape', at + ': ' + m); }
    const homes = r.consts && typeof r.consts === 'object' ? Object.keys(r.consts) : [];
    if (!homes.length) say('shape', at + ': no consts (where do its numbers live?)');

    /* one-home */
    const names = [];
    for (const home of homes) {
      if (!home.startsWith('src/data/') || !files.has(home)) { say('one-home', at + ': ' + home + ' is not a file under src/data'); continue; }
      for (const name of r.consts[home]) {
        names.push([name, home]);
        const re = new RegExp('\\bexport\\s+const\\s+' + esc(name) + '\\b', 'g');
        const per = [...code].map(([f, t]) => [f, (t.match(re) || []).length]).filter(([, k]) => k > 0);
        const n = per.reduce((s, [, k]) => s + k, 0);
        if (n !== 1 || per[0][0] !== home) say('one-home', at + ': ' + name + ' is exported ' + n + ' time(s) (' + (per.map(([f]) => f).join(', ') || 'nowhere') + '), not once from ' + home);
      }
    }

    /* typed-again */
    const policed = [...names.map(([n]) => n), ...(r.retired || []), ...(r.keys || [])];
    for (const name of policed) {
      /* `NAME = 5` anywhere, or `NAME: 5` as an object key (after `{`, `,` or at the start of a line: `x ? NAME : 0` is not a definition) */
      const value = '\\s*(?:Object\\.freeze\\(\\s*)?[\\[{]?\\s*[-+]?\\.?\\d';
      const re = new RegExp('(?:(?<![\\w$.])' + esc(name) + '\\s*=(?!=)|(?<=[{,]\\s*|^\\s*)["\'`]?' + esc(name) + '["\'`]?\\s*:)' + value, 'gm');
      for (const [f, t] of code) {
        if (f === REGISTRY) continue;
        for (const m of t.matchAll(re)) {
          const own = homes.includes(f) && (r.consts[f].includes(name) ? /export\s+const\s+$/.test(t.slice(0, m.index)) : (r.keys || []).includes(name));
          if (!own) hits.push({ at, name, file: f, index: m.index, line: lineOf(t, m.index) });
        }
      }
    }

    /* bound */
    const ev = /^(src\/(?:core|data)\/\S+\.js) (\w+)$/.exec(r.evaluator || '');
    if (!ev) say('bound', at + ': evaluator is not "<file under src/core or src/data> <function>"');
    else {
      const t = code.get(ev[1]);
      if (!t || !new RegExp('\\bexport\\s+function\\s+' + ev[2] + '\\s*\\(').test(t)) say('bound', at + ': ' + ev[1] + ' exports no function ' + ev[2]);
      const fn = evaluators[r.id];
      if (typeof fn !== 'function') say('bound', at + ': EVALUATORS has no function for it');
      else if (fn.name !== ev[2]) say('bound', at + ': EVALUATORS binds ' + fn.name + ', the row names ' + ev[2]);
    }

    /* reader */
    for (const [f, fn] of Object.entries(r.readers || {})) {
      const t = code.get(f);
      if (!t || !new RegExp('\\b' + esc(fn) + '\\s*\\(').test(noStrings(t))) say('reader', at + ': ' + f + ' does not call ' + fn + ' (it must not work the number out itself)');
    }
  }
  for (const id of Object.keys(evaluators)) if (!ids.has(id)) say('bound', 'EVALUATORS binds ' + id + ', which no row publishes');

  /* pending, then the copies it does not cover */
  if (pending.length > ceiling) say('pending', 'PENDING holds ' + pending.length + ' entries, the ceiling is ' + ceiling + ': it only shrinks');
  for (const p of pending) {
    const t = code.get(p.file) || '';
    const n = t.split(p.text).length - 1;
    if (n !== 1) { say('pending', p.file + ': ' + JSON.stringify(p.text) + ' matches ' + n + ' time(s). If the copy is gone, delete the entry'); continue; }
    const i = t.indexOf(p.text), h = hits.filter((x) => x.file === p.file && x.index === i);
    if (!h.length) say('pending', p.file + ': ' + JSON.stringify(p.text) + ' is no longer a copy of anything. Delete the entry');
    for (const x of h) waived.add(x);
  }
  for (const x of hits) if (!waived.has(x)) say('typed-again', x.at + ': ' + x.file + ':' + x.line + ' gives ' + x.name + ' a number. Its one home is the row\'s consts');

  /* core-clean */
  for (const [f, t] of code) {
    if (!f.startsWith(EVALUATOR_DIR) || f.endsWith('/evaluators.js')) continue;
    const s = noStrings(t);
    for (const m of s.matchAll(/(?<![\w$.])\d+(?:\.\d+)?(?![\w$])/g)) {
      if (!STRUCTURAL.has(m[0])) say('core-clean', f + ':' + lineOf(s, m.index) + ' types ' + m[0] + '. An evaluator reads its numbers from src/data');
    }
  }
  return bad;
}

/* ── THE MUTATION PROOF ─────────────────────────────────────────────────────
   Each entry plants one breach into a copy of the scanned text (never the disk) and names the rule that must
   catch it. An anchor that does not match exactly once is a harness failure, as tests/mutant-anchors.mjs checks. */
const MUTANTS = [
  { name: 'the edge types the raw rate again', rule: 'typed-again', file: 'supabase/functions/hr-accrue/catalogue.js',
    find: 'export const SHOP_UNIT_PRICE = ', repl: 'export const VENDOR_RAW_RATE = 0.20;\nexport const SHOP_UNIT_PRICE = ' },
  { name: 'a tool types the gear ladder', rule: 'typed-again', file: 'tools/qa/craft-economy.mjs',
    find: "import { vendorPriceOf } from '../../supabase/functions/hr-accrue/catalogue.js';", repl: 'const VENDOR_GEAR_RATES = [0.5, 0.5, 0.14];' },
  { name: 'a data file retypes a rate under its key', rule: 'typed-again', file: 'src/data/supply-basics.js',
    find: 'export const SHOP_PREMIUM = 2;', repl: 'export const SHOP_PREMIUM = 2;\nconst sale = { buybackRate: 0.6 };' },
  { name: 'the rows are exported a second time', rule: 'one-home', file: 'src/core/shop-buyback.js',
    find: 'export function cheapestShopUnitPrice(offers) {', repl: 'export const SALE = Object.freeze({});\nexport function cheapestShopUnitPrice(offers) {' },
  { name: 'the evaluator types a rate', rule: 'core-clean', file: 'src/core/formulas/sale.js',
    find: 'Math.floor(v * SALE.rawRate)', repl: 'Math.floor(v * 0.2)' },
  { name: 'the edge works the price out itself', rule: 'reader', file: 'supabase/functions/hr-accrue/catalogue.js',
    find: '  return salePriceOf(catalogueGet(items, id), unit);', repl: '  const it = catalogueGet(items, id); return it ? Math.min(it.v, unit || it.v) : 0;' },
  { name: 'the evaluator is renamed under the row', rule: 'bound', file: 'src/core/formulas/sale.js',
    find: 'export function salePriceOf(item, shopUnit) {', repl: 'export function priceOfSale(item, shopUnit) {' },
  { name: 'core types max HP from its own numbers', rule: 'typed-again', file: 'src/core/vitals.js',
    find: 'export function maxHpFor(level, heavy) {', repl: 'const own = { hpBase: 150, hpPerLevel: 10 };\nexport function maxHpFor(level, heavy) {' },
  { name: 'core types the capped XP table again', rule: 'typed-again', file: 'src/core/xp.js',
    find: 'const XP_TABLE = CAPPED_CURVE.totals;', repl: 'const XP_TABLE = [0, 83, 174];' },
  { name: 'the edge types the death share', rule: 'typed-again', file: 'supabase/functions/hr-accrue/catalogue.js',
    find: 'export const SHOP_UNIT_PRICE = ', repl: 'const DEATH_XP_LOSS = 0.02;\nexport const SHOP_UNIT_PRICE = ' },
  { name: 'core types the temper rung', rule: 'typed-again', file: 'src/core/temper.js',
    find: 'export function temperRung(temper, track, tier) {', repl: 'const TEMPER_RUNG_PM = 10;\nexport function temperRung(temper, track, tier) {' },
  { name: 'a pending copy is deleted and stays listed', rule: 'pending', file: 'src/data/shops.js',
    find: '      "VENDOR_RAW_RATE": 0.2,\n', repl: '' },
];
/* Breaches of the registry itself (rows and bindings are modules, not text). */
const ROW_MUTANTS = [
  { name: 'a row with no evaluator bound', rule: 'bound', edit: (a) => ({ ...a, evaluators: {} }) },
  { name: 'an evaluator no row publishes', rule: 'bound', edit: (a) => ({ ...a, evaluators: { ...a.evaluators, 'ghost.formula': () => 0 } }) },
  { name: 'a row holds a function a wiki cannot print', rule: 'shape',
    edit: (a) => ({ ...a, formulas: a.formulas.map((r, i) => (i ? r : { ...r, params: Object.freeze({ ...r.params, refHp: (L) => L }) })) }) },
  { name: 'a row holds a number that can be edited at runtime', rule: 'shape',
    edit: (a) => ({ ...a, formulas: a.formulas.map((r, i) => (i ? r : { ...r, params: Object.freeze({ ...r.params, table: [1, 2] }) })) }) },
  { name: 'a row names a home outside src/data', rule: 'one-home',
    edit: (a) => ({ ...a, formulas: a.formulas.map((r, i) => (i ? r : { ...r, consts: { 'src/core/shop-buyback.js': ['SALE'] } })) }) },
  { name: 'the pending list grows', rule: 'pending', edit: (a) => ({ ...a, ceiling: PENDING.length - 1 }) },
];

async function load() {
  const { FORMULAS } = await import('../src/data/formulas/registry.js');
  const { EVALUATORS } = await import('../src/core/formulas/evaluators.js');
  return { files: readTree(), formulas: FORMULAS, evaluators: EVALUATORS };
}

async function selftest() {
  const base = await load();
  const clean = check(base);
  if (clean.length) throw new HarnessError('control: the tree is not clean, so no mutant proves anything (' + clean[0].msg + ')');
  const slipped = [];
  for (const m of MUTANTS) {
    const text = base.files.get(m.file);
    if (text === undefined || text.split(m.find).length !== 2) throw new HarnessError('mutant "' + m.name + '": the anchor matches ' + (text === undefined ? 'no file' : text.split(m.find).length - 1 + ' time(s)') + ' in ' + m.file);
    const files = new Map(base.files); files.set(m.file, text.replace(m.find, m.repl));
    if (!check({ ...base, files }).some((b) => b.rule === m.rule)) slipped.push(m.name + ' (expected ' + m.rule + ')');
  }
  for (const m of ROW_MUTANTS) if (!check(m.edit(base)).some((b) => b.rule === m.rule)) slipped.push(m.name + ' (expected ' + m.rule + ')');
  const n = MUTANTS.length + ROW_MUTANTS.length;
  if (slipped.length) { console.error('formula-single-source --selftest: ' + slipped.length + ' of ' + n + ' SLIPPED\n  ' + slipped.join('\n  ')); return 1; }
  console.log('formula-single-source --selftest: all ' + n + ' planted breaches caught, each by its rule');
  return 0;
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  const base = await load();
  const bad = check(base);
  if (process.argv.includes('--report')) {
    for (const r of base.formulas) {
      console.log(r.id + '  ' + r.title + '\n    numbers: ' + Object.entries(r.consts).map(([f, n]) => f + ' ' + n.join(', ')).join(' | ')
        + '\n    evaluator: ' + r.evaluator + '\n    ' + r.expr.join('\n    '));
    }
    console.log('pending copies: ' + PENDING.length + ' of ' + PENDING_CEILING + (PENDING.length ? ' (' + PENDING.map((p) => p.file + ' ' + p.text).join('; ') + ')' : ''));
  }
  if (bad.length) { console.error('formula-single-source: ' + bad.length + ' breach(es)\n  ' + bad.map((b) => '[' + b.rule + '] ' + b.msg).join('\n  ')); return 1; }
  console.log('formula-single-source: ' + base.formulas.length + ' formula(s), each with one home and one evaluator; ' + PENDING.length + ' pending cop' + (PENDING.length === 1 ? 'y' : 'ies') + ' (' + base.files.size + ' files scanned)');
  return 0;
}

main().then((c) => process.exit(c), (e) => { console.error((e instanceof HarnessError ? 'HARNESS: ' : '') + (e && e.stack || e)); process.exit(2); });
