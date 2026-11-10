#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════
// tests/hero-limit-literals.mjs — THE HERO LIMITS ARE READ, NEVER TYPED.
//
//   node tests/hero-limit-literals.mjs             the gate, against the baseline
//   node tests/hero-limit-literals.mjs --report    every hit, by file and rule
//   node tests/hero-limit-literals.mjs --write     re-record the baseline (it may only fall)
//   node tests/hero-limit-literals.mjs --selftest  planted literals must go RED, the home and a comment stay GREEN
//
// mutant-anchors: none — the proof measures in-memory file maps, never the tree
//
// WHY (architecture audit 2026-11-09, S10). How many heroes an account holds and how many play at once are config
// (Tyler 2026-10-17), and the slot cap moved once already (5 to 4, Tyler 2026-11-08). The numbers were typed into gates
// (`slot > 5`, `const MAX_SLOT = 5`, `max_concurrent <= 8`) and into sentences ("All four heroes can play at once"),
// so a change of rule was a code hunt and a missed one was a screen that disagreed with the server. Their one home is
// src/data/hero-limits.js (HERO_LIMITS; SESSION_CONFIG reads it), and a page reads the server's own numbers.
//
// WHAT COUNTS, on code with its comments stripped (strings stay, they are what a player reads):
//   HL-1  a slot id compared with a digit 2..9        slot > 5 · p_slot <= 5 · slotId < 6
//   HL-2  a limit constant given a digit              MAX_SLOT = 5 · maxSlot: 5 · maxConcurrentCharacters: 4
//   HL-3  the play cap compared with a digit 2..9     max_concurrent <= 8   (>= 1 is a floor, not the rule)
//   HL-4  the rule said with its number in a sentence "up to four ... at once" · "Four of your heroes" ·
//                                                     "up to three more" · "one hero slot" · "4 heroes"
// THE CLIENT AND ITS DATA (src/**, the vendor bundle aside) hold NONE: the ceiling is 0 and stays 0.
// THE EDGE (supabase/functions/**) is RATCHETED at today's count, per file: it restates the slot-id bound
// (request.js MAX_SLOT, frame-self.js) until the server lane moves it to one limits row. No file may gain one.
// The SQL chain is not read here: its 160 `p_slot > 5` sit in applied migrations, and the latest bodies are that lane's.
// ═════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'tests/hero-limit-literals.baseline.json');
/** The one file that may state the numbers. */
export const HOME = 'src/data/hero-limits.js';
const CLIENT = Object.freeze({ dirs: ['src'], skip: ['src/vendor/'], ext: ['.js'] });
const EDGE = Object.freeze({ dirs: ['supabase/functions'], skip: [], ext: ['.js', '.ts'] });
const MIN_CLIENT_FILES = 300;

export const RULES = Object.freeze([
  ['HL-1', /[sS]lot(?:_?[iI]d)?\s*(?:<=|>=|<|>)\s*[2-9]\b(?!\s*\*)/],
  ['HL-2', /\b(?:MAX_(?:HERO_)?SLOTS?|MAX_HEROES_AT_ONCE|maxSlot|maxConcurrent\w*|playAtOnce|slotIdMax)\s*[:=]\s*\d/],
  ['HL-3', /max_concurrent\s*(?:<=|>=|<|>|===?|!==?)\s*[2-9]/],
  ['HL-4', /\b(?:up to|all|at most) (?:four|five|six|[4-6]) (?:of yours?\b|of your heroes|heroes|characters|play\b|can play)|\b(?:Four|Five|[45]) (?:of your )?heroes\b|\bup to (?:two|three|four|[2-4]) more\b|\b(?:one|two|[12]) hero slots?\b|\b[4-6] heroes at once\b/i],
]);

/** `text` with its comments blanked (line structure kept). Strings and templates are stepped over whole. */
export function stripComments(text) {
  let out = ''; let i = 0;
  while (i < text.length) {
    const c = text[i]; const two = text.slice(i, i + 2);
    if (two === '//') { const j = text.indexOf('\n', i); i = j < 0 ? text.length : j; continue; }
    if (two === '/*') { const j = text.indexOf('*/', i + 2); const end = j < 0 ? text.length : j + 2; out += text.slice(i, end).replace(/[^\n]/g, ''); i = end; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c && (c === '`' || text[j] !== '\n')) j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Every hit in one file: [{ rule, line, text }]. */
export function hitsOf(text) {
  const out = [];
  stripComments(text).split('\n').forEach((line, n) => {
    for (const [rule, re] of RULES) if (re.test(line)) out.push({ rule, line: n + 1, text: line.trim().slice(0, 140) });
  });
  return out;
}

function walk(scope, dir, out) {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const n of readdirSync(join(ROOT, dir)).sort()) {
    const p = dir + '/' + n;
    if (scope.skip.some((s) => (p + '/').startsWith(s) || p.startsWith(s))) continue;
    if (statSync(join(ROOT, p)).isDirectory()) walk(scope, p, out);
    else if (scope.ext.some((e) => p.endsWith(e))) out[p] = readFileSync(join(ROOT, p), 'utf8');
  }
  return out;
}
const tree = (scope) => scope.dirs.reduce((acc, d) => walk(scope, d, acc), {});

/**
 * @param {{client: object, edge: object}} files  path -> text
 * @param {{edge: object}} base  the edge's ceiling per file
 */
export function check(files, base) {
  const problems = []; const counts = { client: 0, edge: {} };
  for (const [f, text] of Object.entries(files.client)) {
    if (f === HOME) continue;
    for (const h of hitsOf(text)) { counts.client++; problems.push(`${h.rule} ${f}:${h.line} types a hero limit: ${h.text}  (read HERO_LIMITS / SESSION_CONFIG, or the server's account.max_concurrent / hero_slots_max)`); }
  }
  if (Object.keys(files.client).length < MIN_CLIENT_FILES || !(HOME in files.client)) problems.push(`HL-0 only ${Object.keys(files.client).length} client file(s) read, or ${HOME} is gone: the guard is reading the wrong tree`);
  const ceil = (base && base.edge) || {};
  for (const [f, text] of Object.entries(files.edge)) {
    const hits = hitsOf(text);
    if (hits.length) counts.edge[f] = hits.length;
    const max = ceil[f] || 0;
    if (hits.length > max) problems.push(`HL-5 ${f} types ${hits.length} hero limit(s), ceiling ${max}: ` + hits.map((h) => h.rule + ' line ' + h.line).join(', ') + '  (the edge reads request.js MAX_SLOT until the server lane gives it one limits row; no file may add one)');
    if (hits.length < max) problems.push(`HL-6 ${f} is under its ceiling (${hits.length} of ${max}): lower it with --write, the baseline only falls`);
  }
  for (const f of Object.keys(ceil)) if (!(f in files.edge)) problems.push(`HL-6 ${f} is in the baseline and no longer in the tree: --write`);
  return { problems, counts };
}

const readBase = () => (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { edge: {} });
const real = () => ({ client: tree(CLIENT), edge: tree(EDGE) });

if (process.argv.includes('--selftest')) {
  const files = real(); const base = readBase();
  const withClient = (f, fn) => ({ client: { ...files.client, [f]: fn(files.client[f] || '') }, edge: files.edge });
  const anEdge = Object.keys(base.edge)[0];
  const cases = [
    ['the tree as it is', files, base, null],
    ['a slot bound typed into an intent module', withClient('src/session/party-intents.js', (s) => s + '\nconst MAX_SLOT = 5;\nexport const ok = (slot) => slot >= 0 && slot <= MAX_SLOT;\n'), base, 'HL-2 src/session/party-intents.js'],
    ['a slot id compared with a digit', withClient('src/session/honor-roll.js', (s) => s.replace('r.slot <= SESSION_CONFIG.maxSlot', 'r.slot <= 5')), base, 'HL-1 src/session/honor-roll.js'],
    ['the play cap compared with a digit', withClient('src/session/account-session.js', (s) => s.replace('a.max_concurrent <= cfg.maxSlot + 1', 'a.max_concurrent <= 8')), base, 'HL-3 src/session/account-session.js'],
    ['the config states its own number again', withClient('src/session/config.js', (s) => s.replace('maxConcurrentCharacters: HERO_LIMITS.playAtOnce', 'maxConcurrentCharacters: 4')), base, 'HL-2 src/session/config.js'],
    ['a sentence says the play cap', withClient('src/data/hunt-tutorial.js', (s) => s + "\nexport const X = 'Up to four of yours can hunt at once.';\n"), base, 'HL-4 src/data/hunt-tutorial.js'],
    ['a sentence says the slots', withClient('src/data/how-to-play.js', (s) => s + "\nexport const Y = 'You start with one hero slot, and gold buys up to three more.';\n"), base, 'HL-4 src/data/how-to-play.js'],
    ['a refusal says Four heroes', withClient('src/data/refusal-words.js', (s) => s + "\nexport const Z = 'Four of your heroes are already playing.';\n"), base, 'HL-4 src/data/refusal-words.js'],
    ['the number in a comment is not a literal', withClient('src/session/party-intents.js', (s) => s + '\n// slot > 5 is refused; up to four heroes play at once\n/* const MAX_SLOT = 5; */\n'), base, null],
    ['the home may state the numbers', withClient(HOME, (s) => s + '\nexport const AGAIN = { playAtOnce: 4, slotIdMax: 5 };\n'), base, null],
    ['an edge file gains a literal', { client: files.client, edge: { ...files.edge, [anEdge]: files.edge[anEdge] + '\nconst MAX_SLOT = 5;\n' } }, base, 'HL-5 ' + anEdge],
    ['a new edge file types the bound', { client: files.client, edge: { ...files.edge, 'supabase/functions/hr-accrue/new.js': 'export const ok = (slot) => slot > 5;\n' } }, base, 'HL-5 supabase/functions/hr-accrue/new.js'],
    ['an edge file under its ceiling must lower it', { client: files.client, edge: { ...files.edge, [anEdge]: '' } }, base, 'HL-6 ' + anEdge],
    ['the tree not read', { client: Object.fromEntries(Object.entries(files.client).slice(0, 5)), edge: files.edge }, base, 'HL-0'],
  ];
  let bad = 0;
  for (const [name, f, b, want] of cases) {
    const got = check(f, b).problems;
    const ok = want === null ? got.length === 0 : got.some((p) => p.startsWith(want));
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' — wanted ' + (want || 'no finding') + ', got ' + (got.slice(0, 2).join(' | ') || 'none')}`);
    if (!ok) bad++;
  }
  console.log(bad ? `hero-limit-literals --selftest: ${bad} FAILED` : `hero-limit-literals --selftest: ${cases.length} cases, every planted literal caught`);
  process.exit(bad ? 1 : 0);
}

const files = real();
if (process.argv.includes('--write')) {
  const { counts } = check(files, { edge: {} });
  const was = readBase().edge || {};
  const grew = Object.keys(counts.edge).filter((f) => existsSync(BASELINE) && counts.edge[f] > (was[f] || 0));
  if (grew.length) { console.error('hero-limit-literals --write: REFUSED, the baseline only falls: ' + grew.join(', ')); process.exit(1); }
  writeFileSync(BASELINE, JSON.stringify({ _generated_by: 'node tests/hero-limit-literals.mjs --write', _note: 'the edge\'s typed hero limits, per file; it only falls. The client holds none.', edge: counts.edge }, null, 2) + '\n');
  console.log('hero-limit-literals --write: ' + Object.values(counts.edge).reduce((a, b) => a + b, 0) + ' edge literal(s) in ' + Object.keys(counts.edge).length + ' file(s)');
  process.exit(0);
}
const { problems, counts } = check(files, readBase());
if (process.argv.includes('--report')) {
  for (const [f, text] of Object.entries({ ...files.client, ...files.edge })) if (f !== HOME) for (const h of hitsOf(text)) console.log(`  ${h.rule} ${f}:${h.line}  ${h.text}`);
}
if (problems.length) {
  console.error('hero-limit-literals: RED');
  for (const p of problems) console.error('  ✗ ' + p);
  process.exit(1);
}
console.log(`hero-limit-literals: ${Object.keys(files.client).length} client files type no hero limit (home: ${HOME}); the edge holds ${Object.values(counts.edge).reduce((a, b) => a + b, 0)} in ${Object.keys(counts.edge).length} file(s), at its ceiling`);
