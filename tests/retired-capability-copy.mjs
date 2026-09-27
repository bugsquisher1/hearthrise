#!/usr/bin/env node
// ============================================================================
// tests/retired-capability-copy.mjs — NO SHIPPED SENTENCE PROMISES A CAPABILITY
// THE CUTOVER RETIRED.
//
//   node tests/retired-capability-copy.mjs             # the guard
//   node tests/retired-capability-copy.mjs --selftest  # mutation proof
//
// The server is the only copy of a character (CLAUDE.md §1, §6). The blob, the
// guest account, offline play, save files and local backups are gone, but the
// UI kept offering them: Settings › Data exported a 2-byte '{}' as a "safety
// net", listed another account's parked character under "Save backups", and
// "Save now" toasted 'Saved.' over a function that saves nothing. Each sentence
// was fixed one at a time and the class came back, so this is the class guard.
//
// WHAT IS SCANNED: shipped src/**/*.js (not src/features/smoke/**, src/vendor/**)
// plus index.html. Comments are stripped; STRINGS ARE KEPT (they are the copy),
// adjacent 'a' + 'b' literals are joined, console.*( arguments are skipped.
// Phrase-level rules only: the bare word 'offline' is legitimate (away accrual).
//
// KEY CENSUS: the retired storage keys may appear only in the loadLocal purge
// and the ALLOW-listed dead plumbing — a new reader or writer is a new rival.
// ============================================================================

import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const RETIRED = [
  { id: 'local-save', why: 'there is no local save; the server is the only copy',
    re: /local save|local progress|\bsave (is|stays|will stay|lives) (local|on this device)|\b(progress|game|character) (is |was )?saved? (locally|on this device)|safe on this device|on this device only|this device only/i },
  { id: 'offline-mode', why: 'online-only: there is no offline play mode',
    re: /\b(playing|play|continue|keep playing) offline\b|\boffline (mode|play|name|guest)\b|\blocal mode\b/i },
  { id: 'sync-your-save', why: 'nothing is uploaded or carried; the realm already holds it',
    re: /\bsync(ing)? your save|progress (will move|uploads)|carried into your account|resume (cloud )?sync/i },
  { id: 'backup-file', why: 'no save file exists to export, import or restore',
    re: /\b(export|import) (your )?save|\bsave backups?\b|restore (from )?backup|download json|replace your save|overwrites your current save/i },
  { id: 'erase-local', why: 'no client erase exists; the server character returns',
    re: /save is deleted|wipe save|character(\\?'|’)?s save|erase \+ reload/i },
  { id: 'save-now', why: 'saving is not a player action', re: /\b[Ss]ave [Nn]ow\b|notify\s*\(\s*(['"`])Saved\.?\1/ },
  { id: 'guest', why: 'no guest accounts', re: /continue as guest/i },
];

const RETIRED_KEYS = /hearthbound-save-v2|hearthrise:save-backup:|hearthrise:char:/g;

/* Every entry: where (repo path), match (regex over ~120 chars of context), reason. */
const DEFERRED = 'C1 deferred: consent gate pending owner decision';
const PLUMBING = 'dead blob plumbing, follow-up';
const ALLOW = [
  { where: 'src/net/accrue.js', match: /replace your local progress/, reason: DEFERRED },
  { where: 'src/net/accrue.js', match: /Keep my local save/, reason: DEFERRED },
  { where: 'src/legacy.js', match: /SAVE_KEY\s*=\s*'hearthbound-save-v2'/, reason: 'the key the loadLocal purge removes' },
  { where: 'src/legacy.js', match: /RETIRED_PREFIXES=\[/, reason: 'the loadLocal purge of the retired prefixes' },
  { where: 'src/legacy.js', match: /PARK_PREFIX\s*=/, reason: PLUMBING + ' (park helpers, pinned by b318)' },
  { where: 'src/multi-character.js', match: /SAVE_KEY = 'hearthbound-save-v2'/, reason: PLUMBING + ' (slot copy)' },
  { where: 'src/multi-character.js', match: /function charKey/, reason: PLUMBING + ' (slot copy)' },
  { where: 'src/net/client-state.js', match: /too much local progress to store/, reason: 'residue PUT size warning, not a save promise' },
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor']);

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!p.endsWith(join('features', 'smoke'))) await walk(p, out); }
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const keepLines = (s) => s.replace(/[^\n]/g, ' ');

/* Comments out, strings in, 'a' + 'b' joined, console.*( arguments blanked. Line
   numbers survive every step (blanked text keeps its newlines). */
export function prepare(src) {
  let out = src
    .replace(/\/\*[\s\S]*?\*\//g, keepLines)
    .replace(/<!--[\s\S]*?-->/g, keepLines)
    .replace(/(^|[^:'"`\\\w])\/\/.*$/gm, (m, p) => p + ' '.repeat(m.length - p.length));
  /* A joined literal loses its newlines; they are re-inserted at the end of the line. */
  out = out.split(/(?<=\n)/).reduce((acc, line) => {
    const held = acc.carry + line;
    const joined = held.replace(/(['"`])[ \t]*\+\s*(['"`])/g, '');
    const lost = (held.match(/\n/g) || []).length - (joined.match(/\n/g) || []).length;
    if (/['"`][ \t]*\+\s*$/.test(held)) return { text: acc.text, carry: held };
    return { text: acc.text + joined + '\n'.repeat(lost), carry: '' };
  }, { text: '', carry: '' });
  out = out.text + out.carry;
  const CON = /console\s*\.\s*\w+\s*\(/g;
  let m;
  while ((m = CON.exec(out)) !== null) {
    let depth = 1, i = m.index + m[0].length, q = null;
    for (; i < out.length && depth > 0; i++) {
      const c = out[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    out = out.slice(0, m.index) + keepLines(out.slice(m.index, i)) + out.slice(i);
  }
  return out;
}

export function scanText(rel, src, allow = ALLOW, used = new Set()) {
  const hits = [];
  const code = prepare(src);
  const ctx = (i, n) => code.slice(Math.max(0, i - 60), i + n + 60).replace(/\s+/g, ' ');
  const lineOf = (i) => code.slice(0, i).split('\n').length;
  const excuse = (c) => allow.find((a) => a.where === rel && a.match.test(c));
  for (const r of RETIRED) {
    const re = new RegExp(r.re.source, r.re.flags + 'g');
    let m;
    while ((m = re.exec(code)) !== null) {
      const c = ctx(m.index, m[0].length), a = excuse(c);
      if (a) { used.add(a); continue; }
      hits.push(`${rel}:${lineOf(m.index)} [${r.id}] "${m[0]}" — ${r.why}`);
    }
  }
  RETIRED_KEYS.lastIndex = 0;
  let k;
  while ((k = RETIRED_KEYS.exec(code)) !== null) {
    const c = ctx(k.index, k[0].length), a = excuse(c);
    if (a) { used.add(a); continue; }
    hits.push(`${rel}:${lineOf(k.index)} [key-census] "${k[0]}" — a retired storage key outside the purge`);
  }
  return hits;
}

export async function loadFiles(root) {
  const files = await walk(join(root, 'src'));
  const out = [];
  for (const f of files) out.push({ rel: relative(root, f).split(sep).join('/'), text: await readFile(f, 'utf8') });
  out.push({ rel: 'index.html', text: await readFile(join(root, 'index.html'), 'utf8') });
  return out;
}

export function scanAll(files, allow = ALLOW) {
  const used = new Set();
  const problems = files.flatMap((f) => scanText(f.rel, f.text, allow, used));
  if (files.length < 50) problems.push(`only ${files.length} files scanned — the walk is broken`);
  for (const a of allow) {
    if (!used.has(a)) problems.push(`stale ALLOW entry ${a.where} ${a.match} (${a.reason}) matched nothing — delete it`);
  }
  return problems;
}

async function selftest(root) {
  const files = await loadFiles(root);
  const base = files.find((f) => f.rel === 'src/settings-page.js');
  const fails = [];
  const probe = (name, text, wantRed) => {
    const red = scanText(base.rel, text).length > 0;
    if (red !== wantRed) fails.push(`${name}: expected ${wantRed ? 'RED' : 'GREEN'}`);
  };
  probe('clean settings-page.js', base.text, false);
  const SAMPLES = ['Your local save is safe', 'Continue offline', 'Sync your save', 'Export save',
    "Erase + reload", 'Save now', 'Continue as guest'];
  RETIRED.forEach((r, i) => {
    if (!r.re.test(SAMPLES[i])) fails.push(`sample for ${r.id} does not match its own rule`);
    probe(`(a) ${r.id} as a literal`, base.text + `\nvar __m = '${SAMPLES[i]}';\n`, true);
    probe(`(b) ${r.id} in a block comment`, base.text + `\n/* ${SAMPLES[i]} */\n`, false);
    probe(`(b) ${r.id} in a line comment`, base.text + `\n// ${SAMPLES[i]}\n`, false);
  });
  probe("(a) bare 'Saved.' toast", base.text + "\nnotify('Saved.', 'info');\n", true);
  probe('(c) split literal', base.text + "\nvar __m = 'on this ' + 'device only';\n", true);
  probe('(e) retired key written', base.text + "\nlocalStorage.setItem('hearthbound-save-v2', x);\n", true);
  probe('(f) console argument', base.text + "\nconsole.warn('local save', x);\n", false);
  for (const ok of ['+8h offline cap', 'offline progress', 'Portrait saved on this device',
    'Saved locally — will send when you\\\'re signed in']) {
    probe(`(g) negative control "${ok}"`, base.text + `\nvar __m = '${ok}';\n`, false);
  }
  const stale = scanAll(files, [...ALLOW, { where: 'src/legacy.js', match: /__never_present__/, reason: 'x' }]);
  if (!stale.some((p) => /stale ALLOW entry/.test(p))) fails.push('(d) a stale ALLOW entry was not reported');
  return fails;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const root = process.cwd();
  if (process.argv.includes('--selftest')) {
    const fails = await selftest(root);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? `SELFTEST FAILED (${fails.length})` : 'selftest: every mutation flipped the verdict');
    process.exit(fails.length ? 1 : 0);
  }
  const problems = scanAll(await loadFiles(root));
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(problems.length
    ? `FAIL retired-capability-copy: ${problems.length} finding(s)`
    : 'PASS retired-capability-copy: no shipped copy promises a retired capability');
  process.exit(problems.length ? 1 : 0);
}
