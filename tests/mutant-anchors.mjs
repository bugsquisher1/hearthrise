#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/mutant-anchors.mjs — EVERY MUTANT ANCHOR STILL MATCHES, EXACTLY ONCE
//
//   node tests/mutant-anchors.mjs              the guard (every mutant list in tests/ and tools/)
//   node tests/mutant-anchors.mjs --for <file>  only the anchors that patch <file> (the edit hook)
//   node tests/mutant-anchors.mjs --list        every anchor checked, and the lists it could not read
//   node tests/mutant-anchors.mjs --selftest    a planted stale anchor and a double match go red
//
// mutant-anchors: none — the selftest plants into a temp tree it writes itself
//
// THE INCIDENT (2026-10-22). Three GitHub runs went red about an hour in: a lane
// refactored a file and a test's mutant ANCHOR (the exact text the mutant patches)
// stopped matching — hero-creation's SQL mutants after 2026-11-02-hero-creation.sql
// moved, hunt-screen's HS-18 after vitals-hub.js, "a server-refused slot is not
// struck" after action-facts.js. The browser --mutate shards only find out when
// that mutant's turn comes. This finds it statically, in about a second.
//
// HOW. Every `const <name> = [ … ]` / `{ … }` whose name says mutant (or a
// self-check SILENCE pair) in tests/**/*.mjs and tools/*.mjs is cut out with a
// lexer and evaluated as DATA in an empty vm: the file's own simple top-level
// constants (MIG, FN, join(ROOT, …)) are in scope, anything else is an opaque
// placeholder, and no function in the list is ever called. Each entry yields its
// patches — `[name, file, from, to]`, `[id, name, file, [[from, to], …]]`,
// `{ file, find|from|anchor, … }`, `{ edits|pairs|patches: [[from, to] | [file,
// from, to]] }` — and each anchor is checked the way the harnesses apply it:
//   a NAMED file   the anchor occurs EXACTLY ONCE (CRLF-normalised), pairs of one
//                  entry applied in order, as the harnesses do. 0 = STALE, 2+ = DOUBLE.
//   no file        (the target is implied: `patches: new Map([[MIG, pairs]])`, a
//                  function body read back from the replay) — the anchor must occur
//                  in at least one file the test names (guard-anchors' referenced set).
//                  0 everywhere = STALE; a double cannot be judged without the target.
// A list that cannot be read is listed by --list, never silently green.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, relative, normalize, isAbsolute, basename, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { isMain } from './_is-main.mjs';
import { lex, referencedFiles } from '../tools/guard-anchors.mjs';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const SKIP_DIRS = new Set(['node_modules', '.git', '.pglite-cache', '.ci-local', 'fixtures']);
const LIST_NAME = /mutant|silence|companion/i;
const PATHY = /^\/?[\w./@-]+\.(?:m?js|sql|json|ts|css|html|toml|ya?ml|sh)$/;
const UNRESOLVED = '\u0000?\u0000';
const SELF = '\u0000self';
const FILE_KEYS = ['file', 'path', 'target', 'migration', 'mig', 'src', 'in'];
const TO_KEYS = ['to', 'replace', 'repl', 'with', 'after', 'replacement'];
const ANCHOR_KEYS = ['find', 'from', 'anchor', 'match', 'needle', 'search', 'old', 'before'];

// ── cutting a literal out of the source ─────────────────────────────────────
const REGEX_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '\n']);
/** Index just past the bracket that closes the one at `at` (strings, templates, comments, regexes skipped). */
export function closeOf(src, at) {
  const stack = [];
  let prev = '\n';
  let i = at;
  const n = src.length;
  const skipQuoted = (q) => { i++; while (i < n && src[i] !== q) i += src[i] === '\\' ? 2 : 1; i++; };
  const skipTemplate = () => {
    i++;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { const e = closeOf(src, i + 1); if (e < 0) { i = n; return; } i = e; continue; }
      i++;
    }
    i++;
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '\'' || c === '"') { skipQuoted(c); prev = 'a'; continue; }
    if (c === '`') { skipTemplate(); prev = 'a'; continue; }
    if (c === '/' && REGEX_AFTER.has(prev)) {
      let j = i + 1; let cls = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break;
        j++;
      }
      if (src[j] === '/') { i = j + 1; while (i < n && /[a-z]/.test(src[i])) i++; prev = 'a'; continue; }
    }
    if (c === '[' || c === '{' || c === '(') stack.push(c);
    else if (c === ']' || c === '}' || c === ')') { stack.pop(); if (!stack.length) return i + 1; }
    if (/\s/.test(c)) { if (c === '\n' && prev !== 'a') prev = '\n'; i++; continue; }
    prev = /[\w$]/.test(c) ? 'a' : c;
    i++;
  }
  return -1;
}

/** Every `const NAME = [ … ]` / `{ … }` naming a mutant list: [{ name, line, text }]. */
export function mutantLists(src) {
  const out = [];
  for (const m of src.matchAll(/^[ \t]*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*([[{])/gm)) {
    if (!LIST_NAME.test(m[1])) continue;
    const at = m.index + m[0].length - 1;
    const end = closeOf(src, at);
    if (end < 0) continue;
    out.push({ name: m[1], line: src.slice(0, m.index).split('\n').length, text: src.slice(at, end) });
  }
  return out;
}

// ── evaluating it as data ────────────────────────────────────────────────────
/* A name the vm cannot resolve is an opaque placeholder. Calling one records the call:
   `bodyMutant(settleDef, from, to)` (a helper local to the harness) keeps its arguments, so
   a patch-shaped helper (its name says mutant / patch / edit / swap / repl, or one capital
   letter like `C(find, repl)`) still yields its anchor. Nothing is ever executed. */
const OPAQUES = new WeakSet();
const CALLS = new WeakMap();
const PATCH_CALLEE = /mutant|patch|edit|swap|repl|^[A-Z]$/i;
function opaque(name = '') {
  const f = function () {};
  const p = new Proxy(f, {
    get: (t, k) => (k === Symbol.toPrimitive || k === 'toString' || k === 'valueOf' ? () => UNRESOLVED : opaque(name + '.' + String(k))),
    apply: (t, self, args) => { const r = opaque(); CALLS.set(r, { name, args }); return r; },
    construct: () => opaque(), has: () => false,
  });
  OPAQUES.add(p);
  return p;
}
const isOpaque = (v) => OPAQUES.has(v);

function pathHelpers(root, testDir) {
  const j = (...a) => {
    const parts = a.map(String);
    if (parts.some((x) => x.includes(UNRESOLVED))) return UNRESOLVED;
    return parts.reduce((acc, x) => (isAbsolute(x) || /^[A-Za-z]:[\\/]/.test(x) ? x : acc ? join(acc, x) : x), '').replace(/\\/g, '/');
  };
  return {
    ROOT: root.replace(/\\/g, '/'), REPO: root.replace(/\\/g, '/'), HERE: testDir.replace(/\\/g, '/'), __dirname: testDir.replace(/\\/g, '/'),
    join: j, resolve: j, dirname: (p) => posix.dirname(String(p)), basename: (p) => posix.basename(String(p)),
  };
}

/** The file's simple constants (one line each; an indented one only when UPPER_CASE, like
    `const BUMP_LINE = '…'` beside a harness-local list), evaluated in order; failures stay opaque. */
function constants(src, ctx) {
  for (const m of src.matchAll(/^([ \t]*)(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*([^\n;]+);[ \t]*(?:\/\/.*)?$/gm)) {
    m.splice(1, 1, ...(m[1] && !/^[A-Z_][A-Z0-9_]*$/.test(m[2]) ? [null] : []));
    if (m[1] === null || m[1] in ctx.env || LIST_NAME.test(m[1])) continue;
    try {
      const v = evalData(m[2], ctx);
      if (typeof v === 'string' || typeof v === 'number' || (typeof v === 'function' && !isOpaque(v) && /=>/.test(m[2]))) ctx.env[m[1]] = v;
    } catch { /* stays opaque */ }
  }
  /* multi-line UPPER_CASE data tables: `const FILES = { renderers: 'src/…', … };` */
  for (const m of src.matchAll(/^(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=\s*(?:Object\.freeze\()?([[{])/gm)) {
    if (m[1] in ctx.env || LIST_NAME.test(m[1])) continue;
    const at = m.index + m[0].length - 1;
    const end = closeOf(src, at);
    if (end < 0) continue;
    try {
      const v = evalData(src.slice(at, end), ctx, { timeout: 200 });
      if (v && typeof v === 'object' && !isOpaque(v)) ctx.env[m[1]] = v;
    } catch { /* stays opaque */ }
  }
}

function evalData(text, ctx, opts = undefined) {
  const scope = new Proxy(ctx.env, {
    has: (t, k) => typeof k === 'string' && !(k in ctx.globals),
    get: (t, k) => (k === Symbol.unscopables ? undefined : k in t ? t[k] : opaque(String(k))),
  });
  ctx.sandbox.__scope = scope;
  return vm.runInContext(`(function () { with (__scope) { return (${text}\n); } })()`, ctx.sandbox, opts);
}

function context(root, testRel, src) {
  const sandbox = vm.createContext({});
  const globals = new Set(vm.runInContext('Object.getOwnPropertyNames(globalThis)', sandbox));
  const ctx = { sandbox, globals, env: pathHelpers(root, dirname(join(root, testRel))) };
  constants(src, ctx);
  return ctx;
}

// ── reading the patches out of an entry ──────────────────────────────────────
const str = (v) => typeof v === 'string' && !v.includes(UNRESOLVED);
const pathy = (v) => str(v) && (PATHY.test(v.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')));
const isPairList = (v) => Array.isArray(v) && v.length > 0 && v.every((p) => Array.isArray(p) && p.length >= 2 && p.length <= 3);

/** [{ file: string|null, anchor: string|RegExp }] for one entry, in the order the harness applies them. */
export function patchesOf(entry, inherited = null) {
  const out = [];
  const fromPairs = (list, file) => {
    for (const p of list) {
      if (p.length === 3 && pathy(p[0])) out.push({ file: p[0], anchor: p[1], to: p[2] });
      else out.push({ file, anchor: p[0], to: p[1] });
    }
  };
  if (Array.isArray(entry)) {
    if (entry.length === 2 && str(entry[0]) && str(entry[1]) && !pathy(entry[0])) { out.push({ file: inherited, anchor: entry[0], to: entry[1] }); return out; }
    const fi = entry.findIndex(pathy);
    const file = fi >= 0 ? entry[fi] : inherited;
    const pairs = entry.find(isPairList);
    if (pairs) fromPairs(pairs, file);
    else if (fi >= 0 && (str(entry[fi + 1]) || entry[fi + 1] instanceof RegExp) && fi + 2 < entry.length) out.push({ file, anchor: entry[fi + 1], to: entry[fi + 2] });
    /* [label, 'public.hr_fn(uuid,integer)', from, to] — a replayed body named by signature */
    else if (fi < 0 && entry.length >= 3 && entry.every((x) => typeof x === 'string')) out.push({ file, anchor: entry[entry.length - 2], to: entry[entry.length - 1] });
    return out;
  }
  if (CALLS.has(entry)) {
    const { name, args } = CALLS.get(entry);
    if (!PATCH_CALLEE.test(name)) return out;
    if (args.some(pathy)) return patchesOf(args, inherited);
    const n = args.length;
    if (n >= 2 && str(args[n - 2]) && typeof args[n - 1] === 'string') out.push({ file: inherited, anchor: args[n - 2], to: args[n - 1] });
    return out;
  }
  if (entry && typeof entry === 'object' && !isOpaque(entry)) {
    const fk = FILE_KEYS.find((k) => k in entry && !isOpaque(entry[k]));
    const file = fk && typeof entry[fk] === 'string' ? entry[fk] : inherited;
    for (const k of ANCHOR_KEYS) {
      const v = entry[k];
      if (str(v) || v instanceof RegExp) { out.push({ file, anchor: v, to: TO_KEYS.map((t) => entry[t]).find((t) => typeof t === 'string') }); break; }
      if (isPairList(v)) { fromPairs(v, file); break; }
    }
    for (const [k, v] of Object.entries(entry)) {
      if (ANCHOR_KEYS.includes(k)) continue;
      if (isPairList(v)) fromPairs(v, file);
      else if (CALLS.has(v)) out.push(...patchesOf(v, file));
      else if (Array.isArray(v) && v.length && v.every((x) => CALLS.has(x) || (x && typeof x === 'object' && !Array.isArray(x) && !isOpaque(x)))) {
        for (const x of v) out.push(...patchesOf(x, file));
      }
    }
  }
  return out;
}

/** The entries of an evaluated list: an array's elements, a keyed object's values, or the list itself. */
function entriesOf(v) {
  if (Array.isArray(v)) {
    if (v.length === 2 && str(v[0]) && str(v[1])) return [v];
    return v.map((e, i) => [String(i), e]).map(([, e]) => e);
  }
  if (v && typeof v === 'object' && !isOpaque(v)) {
    if (ANCHOR_KEYS.some((k) => k in v) || FILE_KEYS.some((k) => k in v)) return [v];
    return Object.values(v);
  }
  return [];
}

const labelOf = (e, i) => {
  if (Array.isArray(e)) return str(e[0]) ? e[0] : '#' + i;
  if (e && typeof e === 'object') for (const k of ['name', 'id', 'arm', 'label', 'why']) if (str(e[k])) return e[k];
  return '#' + i;
};

// ── the check ───────────────────────────────────────────────────────────────
const stats = new Map();
const kind = (abs) => {
  if (!stats.has(abs)) { let k = null; try { const st = statSync(abs); k = st.isFile() ? 'f' : st.isDirectory() ? 'd' : null; } catch { /* absent */ } stats.set(abs, k); }
  return stats.get(abs);
};
const isFile = (abs) => kind(abs) === 'f';
const isDir = (abs) => kind(abs) === 'd';
const toRel = (root, abs) => relative(root, abs).replace(/\\/g, '/');

const resolved = new Map();
function resolveFile(root, testRel, f, hints = { cands: [], dirs: [] }) {
  if (!str(f)) return null;
  const key = `${root}\u0000${testRel}\u0000${f}\u0000${hints.dirs.join('|')}`;
  if (resolved.has(key)) return resolved.get(key);
  const s = f.replace(/\\/g, '/');
  const bases = [root, dirname(join(root, testRel)), join(root, 'supabase', 'migrations'), ...hints.dirs];
  const names = /\.\w+$/.test(s) ? [s] : [s, s + '.js', s + '.ts', s + '.mjs', s + '.sql'];
  const tries = isAbsolute(s) || /^[A-Za-z]:\//.test(s) ? [s] : names.flatMap((n) => bases.map((b) => join(b, n)));
  let out = null;
  for (const t of tries) if (isFile(t)) { const r = toRel(root, t); if (!r.startsWith('..')) { out = r; break; } }
  if (!out) {
    const byBase = hints.cands.filter((r) => names.includes(basename(r)) || basename(r) === basename(s));
    out = byBase.length === 1 ? byBase[0] : null;
  }
  resolved.set(key, out);
  return out;
}

const REPLAY = /schema-replay|pglite-chain|pglite-template|pg_get_functiondef|bootReplay/;
/** Every file the test names: guard-anchors' referenced set, plus each path-like string or
    constant resolved from the root, the test's directory or supabase/migrations, plus the whole
    migration chain when the test boots a replay (its DB mutants patch a body the chain defines). */
function hintsOf(root, testRel, src, ctx) {
  const out = new Set(referencedFiles(root, testRel, src));
  const strings = [...lex(src).strings, ...Object.values(ctx.env).filter((v) => typeof v === 'string')];
  /* directories the test names (FN = 'supabase/functions/hr-accrue', join(ROOT, 'src', 'core')) */
  const dirs = [];
  /* join(ROOT, 'supabase', 'functions', 'hr-accrue', f) — the literal head of a path built at runtime */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of code.matchAll(/\b(?:join|resolve)\(\s*[\w.$]+\s*,((?:\s*['"][^'"\n]+['"]\s*,)+)/g)) {
    const parts = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
    for (const b of [root, dirname(join(root, testRel))]) { const d = join(b, ...parts); if (isDir(d) && !toRel(root, d).startsWith('..')) dirs.push(d); }
  }
  for (const v of strings) {
    if (!str(v) || !v.includes('/') || !/^[\w./:@ -]+$/.test(v)) continue;
    const abs = isAbsolute(v) || /^[A-Za-z]:\//.test(v) ? v : join(root, v);
    const rel = toRel(root, abs);
    if (rel && !rel.startsWith('..') && isDir(abs)) dirs.push(abs);
  }
  /* `// mutant-anchors: <path> …` — the files the test declares it plants into */
  for (const m of src.matchAll(/^\s*\/\/\s*mutant-anchors:\s*(.+?)\s*$/gm)) for (const e of m[1].split(/[\s,]+/)) if (isFile(join(root, e))) out.add(e);
  const hints = { cands: [], dirs: [...new Set(dirs)] };
  for (const s of strings) {
    const p = s.split('?')[0];
    if (!pathy(p)) continue;
    const r = resolveFile(root, testRel, p, hints);
    if (r) out.add(r);
  }
  hints.chain = REPLAY.test(src);
  out.delete(testRel);
  hints.cands = [...out].sort();
  return hints;
}

/* The whole migration chain as one text, read once per run (16 MB; a string search over it is ~10 ms). */
const chains = new Map();
function chainText(root, read) {
  if (!chains.has(root)) {
    let names = [];
    try { names = readdirSync(join(root, 'supabase', 'migrations')).filter((n) => n.endsWith('.sql')).sort(); } catch { /* none */ }
    chains.set(root, names.map((n) => read(`supabase/migrations/${n}`)).filter((t) => t != null).join('\u0002'));
  }
  return chains.get(root);
}

const count = (text, a) => (a instanceof RegExp
  ? [...text.matchAll(new RegExp(a.source, a.flags.includes('g') ? a.flags : a.flags + 'g'))].length
  : (() => { let n = 0; for (let i = text.indexOf(a); i >= 0 && n < 99; i = text.indexOf(a, i + 1)) n++; return n; })());
const has = (text, a) => (a instanceof RegExp ? new RegExp(a.source, a.flags.replace(/[gy]/g, '')).test(text) : text.includes(a));

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (SKIP_DIRS.has(n)) continue;
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (n.endsWith('.mjs')) out.push(p);
  }
  return out;
}

export function guardFiles(root) {
  const tests = walk(join(root, 'tests'));
  let tools = [];
  try { tools = readdirSync(join(root, 'tools')).filter((n) => n.endsWith('.mjs')).map((n) => join(root, 'tools', n)); } catch { /* no tools/ */ }
  return [...tests, ...tools].map((p) => toRel(root, p)).sort();
}

/**
 * @returns {{ findings: string[], checked: number, lists: number, unread: string[], anchors: object[] }}
 */
export function check(root = ROOT, { only = null, files = null } = {}) {
  const findings = []; const unread = []; const anchors = [];
  let lists = 0;
  const cache = new Map();
  const read = (rel) => {
    if (!cache.has(rel)) { let t = null; try { t = readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { /* gone */ } cache.set(rel, t); }
    return cache.get(rel);
  };
  for (const testRel of files || guardFiles(root)) {
    if (testRel === 'tests/mutant-anchors.mjs') continue;
    const src = read(testRel);
    if (!src || !LIST_NAME.test(src)) continue;
    /* --for: a test that never names the file (or its stem, for `file: 'bounds'`) cannot patch it */
    if (only && !src.includes(basename(only).replace(/\.\w+$/, ''))) continue;
    const found = mutantLists(src);
    if (!found.length) continue;
    let ctx = null; let hints = null;
    for (const L of found) {
      lists++;
      ctx = ctx || context(root, testRel, src);
      if (!hints) {
        hints = hintsOf(root, testRel, src, ctx);
        /* the test itself, its mutant lists blanked: a proof that patches its own functions */
        let self = src;
        for (const X of found) self = self.replace(X.text, '[]');
        cache.set(SELF, self);
      }
      let value;
      try { value = evalData(L.text, ctx, { timeout: 1000 }); } catch (e) { unread.push(`${testRel}:${L.line} ${L.name} — ${String(e.message).split('\n')[0]}`); continue; }
      const entries = entriesOf(value);
      let any = false;
      entries.forEach((e, i) => {
        const ps = patchesOf(e);
        if (!ps.length) return;
        any = true;
        const label = `${testRel}:${L.line} ${L.name} "${String(labelOf(e, i)).slice(0, 70)}"`;
        const working = new Map();
        for (const p of ps) {
          if (!(str(p.anchor) && p.anchor.length) && !(p.anchor instanceof RegExp)) continue;
          const file = resolveFile(root, testRel, p.file, hints);
          if (only && (file ? file !== only : !hints.cands.includes(only))) continue;   // an implied target: when the test names the file
          const show = p.anchor instanceof RegExp ? '/' + p.anchor.source.slice(0, 60) + '/' : JSON.stringify(p.anchor.slice(0, 70));
          if (file) {
            if (!working.has(file)) working.set(file, read(file));
            const text = working.get(file);
            const n = text == null ? 0 : count(text, p.anchor);
            anchors.push({ test: testRel, list: L.name, label, file, n });
            if (text == null) findings.push(`${label}: target ${file} is unreadable`);
            else if (n === 0) findings.push(`STALE  ${label}: anchor ${show} matches 0 times in ${file}`);
            else if (n > 1 && !(p.anchor instanceof RegExp)) findings.push(`DOUBLE ${label}: anchor ${show} matches ${n} times in ${file} (need exactly 1)`);
            if (text != null && str(p.anchor) && n >= 1 && typeof p.to === 'string') working.set(file, text.replace(p.anchor, () => p.to));
          } else {
            if (hints.joined === undefined) hints.joined = hints.cands.map(read).filter((t) => t != null).join('\u0002');
            const where = [hints.joined, read(SELF)].filter((t) => has(t, p.anchor));
            /* a replayed body: any migration of the chain may define it (strings only — a regex over 16 MB is not cheap) */
            if (!where.length && hints.chain && str(p.anchor) && chainText(root, read).includes(p.anchor)) where.push('chain');
            anchors.push({ test: testRel, list: L.name, label, file: null, n: where.length });
            if (!where.length) findings.push(`STALE  ${label}: anchor ${show} matches no file the test names (${p.file ? 'file ' + JSON.stringify(String(p.file).replace(UNRESOLVED, '?')) + ' unresolved; ' : ''}${hints.cands.length} referenced)`);
          }
        }
      });
      if (!any && entries.length) unread.push(`${testRel}:${L.line} ${L.name} — no entry carries a recognisable patch (${entries.length} entr${entries.length === 1 ? 'y' : 'ies'})`);
    }
  }
  return { findings, checked: anchors.length, lists, unread, anchors };
}

// ── --selftest ──────────────────────────────────────────────────────────────
function selftest() {
  const dir = mkdtempSync(join(tmpdir(), 'mutant-anchors-'));
  mkdirSync(join(dir, 'tests'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'supabase', 'migrations'), { recursive: true });
  writeFileSync(join(dir, 'src', 'a.js'), 'export const x = 1;\nexport const y = 2;\nconst pad = 0; const pad = 0;\n');
  writeFileSync(join(dir, 'supabase', 'migrations', '2026-01-01-m.sql'), 'create function f() returns int as $$ select 1 $$;\n');
  const guard = (body) => `const MIG = '2026-01-01-m.sql';\nconst MUTANTS = [\n${body}\n];\nconst SQL_MUTANTS = { a: { why: 'w', pairs: [['select 1', 'select 2']] } };\nawait bootReplay({ patches: new Map([[MIG, SQL_MUTANTS.a.pairs]]) });\n`;
  const CLEAN = "  ['ok', 'src/a.js', 'export const x = 1;', 'export const x = 9;'],\n  { name: 'obj', file: 'src/a.js', find: 'const y = 2', to: 'const y = 3' },\n  ['seq', 'src/a.js', [['= 1;', '= 5;'], ['= 2;', '= 6;']]],";
  const cases = [
    ['clean control', CLEAN, 0],
    ['a planted stale anchor', CLEAN + "\n  ['stale', 'src/a.js', 'export const z = 3;', ''],", /STALE .*"stale"/],
    ['a double match', CLEAN + "\n  ['double', 'src/a.js', 'const pad = 0;', ''],", /DOUBLE .*"double".*2 times/],
    ['a stale object anchor', CLEAN + "\n  { name: 'gone', file: 'src/a.js', from: 'const q', to: '' },", /STALE .*"gone"/],
    ['a stale anchor inside a harness-local helper call', CLEAN + "\n  { name: 'viaHelper', plant: bodyMutant(def, 'select 9', 'select 2') },", /STALE .*"viaHelper"/],
  ];
  let bad = 0;
  const run = (label, body, want, extra) => {
    writeFileSync(join(dir, 'tests', 'g.mjs'), guard(body) + (extra || ''));
    const r = check(dir, { files: ['tests/g.mjs'] });
    const ok = want === 0 ? r.findings.length === 0 && r.checked >= 5 && !r.unread.length : r.findings.some((f) => want.test(f));
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok    ' : 'FAILED'} ${label}${want === 0 ? ` — ${r.checked} anchors green` : ' goes red'}${ok ? '' : ': ' + JSON.stringify(r)}`);
  };
  for (const [label, body, want] of cases) run(label, body, want);
  /* the implied-target arm: SQL_MUTANTS carries no file; its anchor must occur in a file the test names */
  writeFileSync(join(dir, 'tests', 'g.mjs'), guard(CLEAN).replace("[['select 1', 'select 2']]", "[['select 7', 'select 2']]"));
  {
    const r = check(dir, { files: ['tests/g.mjs'] });
    const ok = r.findings.some((f) => /STALE .*SQL_MUTANTS.*matches no file/.test(f));
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok    ' : 'FAILED'} a stale implied-target SQL anchor goes red`);
  }
  /* the CRLF arm: a CRLF checkout must not read as stale */
  writeFileSync(join(dir, 'src', 'a.js'), 'export const x = 1;\r\nexport const y = 2;\r\nconst pad = 0; const pad = 0;\r\n');
  run('a CRLF target with an LF multi-line anchor', CLEAN + "\n  ['crlf', 'src/a.js', 'x = 1;\\nexport', ''],", 0);
  /* --for scopes to one file */
  {
    writeFileSync(join(dir, 'tests', 'g.mjs'), guard(CLEAN + "\n  ['stale', 'src/a.js', 'nope nope', ''],"));
    const a = check(dir, { files: ['tests/g.mjs'], only: 'src/a.js' }).findings.length;
    const b = check(dir, { files: ['tests/g.mjs'], only: 'src/b.js' }).findings.length;
    const ok = a === 1 && b === 0;
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok    ' : 'FAILED'} --for scopes the check to the edited file (${a} / ${b})`);
  }
  console.log(bad ? `mutant-anchors --selftest: ${bad} FAILED` : 'mutant-anchors --selftest: a stale anchor, a double match and a stale implied target each go red; the clean control is green');
  return bad ? 1 : 0;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) process.exit(selftest());
  const t0 = Date.now();
  const forAt = argv.indexOf('--for');
  const only = forAt >= 0 ? toRel(ROOT, join(ROOT, argv[forAt + 1] || '')) : null;
  const r = check(ROOT, { only });
  if (argv.includes('--list')) {
    for (const a of r.anchors) console.log(`${a.file || '(implied)'}\t${a.n}\t${a.label}`);
    for (const u of r.unread) console.log('UNREAD ' + u);
  }
  for (const f of r.findings) console.log('  ✗ ' + f);
  const tail = `${r.checked} anchor(s) in ${r.lists} mutant list(s)${only ? ' patching ' + only : ''}, ${r.unread.length} list(s) unread (--list), ${Date.now() - t0} ms`;
  console.log(r.findings.length ? `mutant-anchors: ${r.findings.length} RED — ${tail}` : `mutant-anchors: every mutant anchor matches exactly once — ${tail}`);
  process.exit(r.findings.length ? 1 : 0);
}
