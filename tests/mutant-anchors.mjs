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
// ci-step: client-guards | Mutant anchors - every mutant anchor matches its file exactly once
// ci-run: node tools/mutant-gate.mjs node tests/mutant-anchors.mjs --selftest
// ci-run: node tests/mutant-anchors.mjs
//
// THE INCIDENT (2026-10-22). Three GitHub runs went red about an hour in: a lane
// refactored a file and a test's mutant ANCHOR (the exact text the mutant patches)
// stopped matching — hero-creation's SQL mutants after 2026-11-02-hero-creation.sql
// moved, hunt-screen's HS-18 after vitals-hub.js, "a server-refused slot is not
// struck" after action-facts.js. The browser --mutate shards only find out when
// that mutant's turn comes. This finds it statically, in seconds (the --for hook: under one).
//
// WHICH LISTS. Every `const <name> = [ … ]` / `{ … }` in tests/**/*.mjs and
// tools/*.mjs, at any depth, is a mutant list when ONE of three things says so,
// none of them a guess (2026-11-26: the name rule alone read 356 lists and left
// MUT / MUTATIONS / PLANTS / GATE_BLIND unread, ten of them stale):
//   THE SHAPE     every entry is a written-out mutant, under any name: a
//                 `[label, file, from, to]`, a `[label, file, [[from, to], …]]`, or a
//                 `{ file, find|from|anchor, to|replace }` / `{ file, edits|pairs: … }`
//                 whose file is a real file of the repo.
//   THE NAME      the repo's mutant words: mutant / mutation / MUT / plant / silence /
//                 companion, and the self-check silencers blind / disarm / neuter /
//                 selfcheck (`GATE_BLIND`, `DISARM_PROJ`, `NEUTER_SELFCHECK`).
//   THE REGISTER  for a list whose shape and name cannot say it (a bare `[from, to]`
//                 pair with an implied target, `const BODY = { … }` that MUTATIONS takes
//                 in at run time): `// mutant-lists: NAME …` in the file (a new test), or
//                 its row in REGISTERED below (an existing one, so a proof does not
//                 re-run for a comment). `not NAME — why` takes out a list the shape
//                 misreads. A registered name with no such list in its file is red.
// Then it is cut out with a lexer and evaluated as DATA in an empty vm: the file's own simple top-level
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
const LIST_NAME = /mutant|mutat|(?:^|_)mut(?:s|_|$)|plant|silence|companion|blind|disarm|neuter|self_?check/i;
const REGISTER = /^\s*\/\/\s*mutant-lists:\s*(.+?)\s*$/gm;
/* THE REGISTER for files written before it (2026-11-26, every list read off a full sweep of the
   repo's literals and checked by hand): the same lines a `// mutant-lists:` header would hold. */
const REGISTERED = Object.freeze({
  'tests/_alpha-windows.mjs': ['HOOK'],
  'tests/account-depot.mjs': ['BODY'],
  'tests/artisan-tick.mjs': ['FUSE_LOCK'],
  'tests/bank-cap-rungs.mjs': ['BODY'],
  'tests/bank-move-many.mjs': ['BODY'],
  'tests/boss-call.mjs': ['OFF'],
  'tests/bounty-abandon-fee.mjs': ['offS5'],
  'tests/cadence-recovery-floor.mjs': ['MARKS'],
  'tests/client-state-retired-fields-adversarial.mjs': ['NEGATIVE_CONTROL'],
  'tests/client-state-retired-fields.mjs': ['NEGATIVE_CONTROL'],
  'tests/client-write-sweep-3.mjs': ['SCENARIOS'],
  'tests/client-write-sweep-4.mjs': ['SCENARIOS'],
  'tests/conservation-fuzz.mjs': ['INJECTIONS'],
  'tests/frame-self-echo.mjs': ['EDGE'],
  'tests/gem-daily-budget.mjs': ['GATES'],
  'tests/house-from-storage.mjs': ['BODY'],
  'tests/house-home.mjs': ['BODY'],
  'tests/house-pelts.mjs': ['FILL_BEAR'],
  'tests/hr-apply-final-body.mjs': ['NEGATIVE_CONTROL'],
  'tests/hr-state-of-final-body.mjs': ['NEGATIVE_CONTROL'],
  'tests/hunt-floor-warning.mjs': ['CONTROLS'],
  'tests/hunts-c1.mjs': ['M'],
  'tests/perf-budget.mjs': ['PROBES'],
  'tests/phone-touch.mjs': ['WORLD_HOOK'],
  'tests/readonly-rpc.mjs': ['BACK_TO_STABLE'],
  'tests/renown-kill-faucet.mjs': ['CONTROLS'],
  'tests/schema-drift.mjs': ['DROP_CANARY'],
  'tests/shared-farm.mjs': ['BODY'],
  'tests/storage-chests.mjs': ['BODY'],
  'tests/unlock-offer-ownership.mjs': ['UNSCOPED_DELETE'],
  'tests/window-camera.mjs': ['HOOKS'],
  'tests/window-globals-exist.mjs': ['not cases — each plant APPENDS its line to the file, so it has no anchor'],
  'tests/world-tick-token-failclosed.mjs': ['NOTICE_0B NOTICE_D10 OVERFIRE_0B'],
});
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

/** A file's register: its `// mutant-lists:` lines and its REGISTERED row (`register`, keyed by file).
    `NAME …` registers lists, `not NAME … — why` says a list the shape misreads is not one (the why is
    required). { names, not: Map(name → why), bad: [line] } */
export function registeredNames(src, file = null, register = REGISTERED) {
  const names = new Set(); const not = new Map(); const bad = [];
  const lines = [...[...src.matchAll(REGISTER)].map((m) => [m[0].trim(), m[1]]),
    ...((file && register[file]) || []).map((l) => [`REGISTERED['${file}'] '${l}'`, l])];
  for (const [line, body] of lines) {
    const [head, ...why] = body.split(/\s+[—–]\s+|\s+--?\s+/);
    const words = head.split(/[\s,]+/).filter(Boolean);
    const neg = words[0] === 'not';
    const ids = (neg ? words.slice(1) : words).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
    if (!ids.length || (neg && !why.join(' ').trim())) { bad.push(line); continue; }
    for (const n of ids) if (neg) not.set(n, why.join(' — ').trim()); else names.add(n);
  }
  return { names, not, bad };
}

/** Every `const NAME = [ … ]` / `{ … }` literal: [{ name, line, text, named }]. `named` = the name
    or the register says mutant list; the rest are read only when their shape does (`all`), and
    never when the register says `not`. */
export function mutantLists(src, { all = false, file = null, register = REGISTERED } = {}) {
  const out = [];
  const reg = registeredNames(src, file, register);
  for (const m of src.matchAll(/^[ \t]*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*([[{])/gm)) {
    const named = reg.names.has(m[1]) || (LIST_NAME.test(m[1]) && !reg.not.has(m[1]));
    if (!named && (!all || reg.not.has(m[1]))) continue;
    const at = m.index + m[0].length - 1;
    const end = closeOf(src, at);
    if (end < 0) continue;
    out.push({ name: m[1], line: src.slice(0, m.index).split('\n').length, text: src.slice(at, end), named });
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
    if (m[1] === null || m[1] in ctx.env) continue;
    try {
      /* every declarator of the line: `const SR = 'a.js', DM = 'b.js';` gives SR 'a.js', never the
         comma's last value (signature-rules.mjs read its SR mutants against damage.js, 2026-11-26) */
      for (const [k, v] of Object.entries(evalDeclarators(m[1], m[2], ctx))) {
        if (k in ctx.env) continue;
        if (typeof v === 'string' || typeof v === 'number' || (typeof v === 'function' && !isOpaque(v) && /=>/.test(m[2]))) ctx.env[k] = v;
      }
    } catch { /* stays opaque */ }
  }
  /* multi-line UPPER_CASE data tables: `const FILES = { renderers: 'src/…', … };` */
  for (const m of src.matchAll(/^(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=\s*(?:Object\.freeze\()?([[{])/gm)) {
    if (m[1] in ctx.env) continue;
    const at = m.index + m[0].length - 1;
    const end = closeOf(src, at);
    if (end < 0) continue;
    try {
      const v = evalData(src.slice(at, end), ctx, { timeout: 200 });
      if (v && typeof v === 'object' && !isOpaque(v)) ctx.env[m[1]] = v;
    } catch { /* stays opaque */ }
  }
}

/** `NAME = <rest of the declaration>` run as assignments: { name: value } for each declarator
    (`A = 'x', B = 'y'` parses as two assignments, so each name keeps its own value). */
function evalDeclarators(name, text, ctx) {
  const got = Object.create(null);
  const scope = new Proxy(ctx.env, {
    has: (t, k) => typeof k === 'string' && (k === name || !(k in ctx.globals)),
    get: (t, k) => (k === Symbol.unscopables ? undefined : k in got ? got[k] : k in t ? t[k] : opaque(String(k))),
    set: (t, k, v) => { got[k] = v; return true; },
  });
  ctx.sandbox.__scope = scope;
  vm.runInContext(`(function () { with (__scope) { ${name} = ${text}\n; } })()`, ctx.sandbox);
  return got;
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
export function patchesOf(entry, inherited = null, env = null) {
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
    /* [file, from, to]: the replacement is text (or a replacer); `[test, 'CONTROL: …', []]` plants nothing (bands.mjs) */
    else if (fi >= 0 && (str(entry[fi + 1]) || entry[fi + 1] instanceof RegExp) && ['string', 'function'].includes(typeof entry[fi + 2])) out.push({ file, anchor: entry[fi + 1], to: entry[fi + 2] });
    /* [label, 'public.hr_fn(uuid,integer)', from, to] — a replayed body named by signature */
    else if (fi < 0 && entry.length >= 3 && entry.every((x) => typeof x === 'string')) out.push({ file, anchor: entry[entry.length - 2], to: entry[entry.length - 1] });
    return out;
  }
  if (CALLS.has(entry)) {
    const { name, args } = CALLS.get(entry);
    if (!PATCH_CALLEE.test(name)) return out;
    if (args.some(pathy)) return patchesOf(args, inherited, env);
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
      /* `mig3Pairs: [...]` beside `file: MIG2` patches the file the key names (MIG3), never the entry's own */
      const keyed = /^(.+?)Pairs$/.exec(k);
      if (keyed && isPairList(v)) { const f = env && env[keyed[1].toUpperCase()]; fromPairs(v, typeof f === 'string' ? f : null); continue; }
      if (isPairList(v)) fromPairs(v, file);
      else if (CALLS.has(v)) out.push(...patchesOf(v, file, env));
      else if (Array.isArray(v) && v.length && v.every((x) => CALLS.has(x) || (x && typeof x === 'object' && !Array.isArray(x) && !isOpaque(x)))) {
        for (const x of v) out.push(...patchesOf(x, file, env));
      }
    }
  }
  return out;
}

/** THE SHAPE: a written-out mutant, whatever its list is called. Only the canonical shapes count,
    and only with a file `resolves` finds: `[label…, file, from, to…]` (labels first, so a
    `[file, needle, why]` assertion row is not one), `[label…, file, [[from, to], …]]`, and an object
    with a file key and an anchor + replacement (or a pair list). */
function writtenOut(e, resolves) {
  const anchor = (v) => (str(v) && v.length > 0) || v instanceof RegExp;
  try {
    if (Array.isArray(e)) {
      const fi = e.findIndex(pathy);
      if (fi < 1 || !e.slice(0, fi).every((x) => str(x) && !pathy(x)) || !resolves(e[fi])) return false;
      const [a, b] = e.slice(fi + 1);
      if (isPairList(a)) return a.every((p) => anchor(p[p.length - 2]) && typeof p[p.length - 1] === 'string');
      return anchor(a) && typeof b === 'string';
    }
    if (e && typeof e === 'object' && !isOpaque(e) && !CALLS.has(e)) {
      const fk = FILE_KEYS.find((k) => typeof e[k] === 'string');
      if (!fk || !pathy(e[fk]) || !resolves(e[fk])) return false;
      if (ANCHOR_KEYS.some((k) => anchor(e[k]))) return TO_KEYS.some((t) => typeof e[t] === 'string');
      return ['edits', 'pairs', 'patches', ...ANCHOR_KEYS].some((k) => isPairList(e[k]));
    }
  } catch { /* a getter that throws is not data */ }
  return false;
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
export function check(root = ROOT, { only = null, files = null, register = REGISTERED } = {}) {
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
    if (!src) continue;
    /* --for: a test that never names the file (or its stem, for `file: 'bounds'`) cannot patch it */
    if (only && !src.includes(basename(only).replace(/\.\w+$/, ''))) continue;
    const found = mutantLists(src, { all: true, file: testRel, register });
    /* THE REGISTER: a registered name is a promise that the list exists; a rename that drops it is red */
    const reg = registeredNames(src, testRel, register);
    for (const b of reg.bad) findings.push(`REGISTER ${testRel}: "${b}" is not \`// mutant-lists: NAME …\` or \`// mutant-lists: not NAME … — why\``);
    for (const n of [...reg.names, ...reg.not.keys()]) if (!new RegExp(`^[ \\t]*(?:export\\s+)?(?:const|let)\\s+${n.replace(/\$/g, '\\$')}\\s*=\\s*[[{]`, 'm').test(src)) {
      findings.push(`REGISTER ${testRel}: \`// mutant-lists:\` names ${n}, and no \`const ${n} = [ … ]\` / \`{ … }\` is in the file`);
    }
    if (!found.length) continue;
    let ctx = null; let hints = null;
    /* pass 1: which literals are mutant lists — the named ones, and the rest only by their shape */
    const picked = [];
    for (const L of found) {
      ctx = ctx || context(root, testRel, src);
      let value;
      try { value = evalData(L.text, ctx, { timeout: 1000 }); } catch (e) {
        if (L.named) unread.push(`${testRel}:${L.line} ${L.name} — ${String(e && e.message).split('\n')[0]}`);
        continue;
      }
      let entries;
      try { entries = entriesOf(value); } catch { entries = null; }
      if (!L.named) {
        /* a list: an array of entries, or a keyed object of them, never one lone entry (`const hk = { file, from, to }`) */
        if (!entries || !entries.length || (entries.length === 1 && entries[0] === value)) continue;
        if (!entries.every((e) => writtenOut(e, () => true))) continue;
        hints = hints || hintsOf(root, testRel, src, ctx);
        if (!entries.every((e) => writtenOut(e, (f) => resolveFile(root, testRel, f, hints) != null))) continue;
      }
      if (!entries) { unread.push(`${testRel}:${L.line} ${L.name} — its entries cannot be read as data`); continue; }
      picked.push({ L, entries });
    }
    if (!picked.length) continue;
    hints = hints || hintsOf(root, testRel, src, ctx);
    /* the test itself, its mutant lists blanked: a proof that patches its own functions */
    let self = src;
    for (const { L: X } of picked) self = self.replace(X.text, '[]');
    cache.set(SELF, self);
    for (const { L, entries } of picked) {
      lists++;
      let any = false;
      entries.forEach((e, i) => {
        let ps;
        try { ps = patchesOf(e, null, ctx.env); } catch { ps = []; }
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
  /* a REGISTERED row for a test that was renamed or deleted is a stale register line */
  if (!only) for (const f of Object.keys(register)) if (read(f) == null) findings.push(`REGISTER ${f}: REGISTERED names a file that is not in the repo`);
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
    const r = check(dir, { files: ['tests/g.mjs'], register: {} });
    const ok = want === 0 ? r.findings.length === 0 && r.checked >= 5 && !r.unread.length : r.findings.some((f) => want.test(f));
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok    ' : 'FAILED'} ${label}${want === 0 ? ` — ${r.checked} anchors green` : ' goes red'}${ok ? '' : ': ' + JSON.stringify(r)}`);
  };
  for (const [label, body, want] of cases) run(label, body, want);
  /* the implied-target arm: SQL_MUTANTS carries no file; its anchor must occur in a file the test names */
  writeFileSync(join(dir, 'tests', 'g.mjs'), guard(CLEAN).replace("[['select 1', 'select 2']]", "[['select 7', 'select 2']]"));
  {
    const r = check(dir, { files: ['tests/g.mjs'], register: {} });
    const ok = r.findings.some((f) => /STALE .*SQL_MUTANTS.*matches no file/.test(f));
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok    ' : 'FAILED'} a stale implied-target SQL anchor goes red`);
  }
  /* the declarator arm: `const SA = 'src/a.js', SB = 'src/b.js';` gives SA its own file, not the comma's last */
  writeFileSync(join(dir, 'src', 'b.js'), 'export const onlyInB = 1;\n');
  {
    const two = "const SA = 'src/a.js', SB = 'src/b.js';\n";
    writeFileSync(join(dir, 'tests', 'g.mjs'), two + guard(CLEAN + "\n  ['sa', SA, 'export const x = 1;', ''],\n  ['sb', SB, 'export const onlyInB = 1;', ''],"));
    const clean = check(dir, { files: ['tests/g.mjs'], register: {} });
    writeFileSync(join(dir, 'tests', 'g.mjs'), two + guard(CLEAN + "\n  ['saStale', SA, 'export const onlyInB = 1;', ''],"));
    const red = check(dir, { files: ['tests/g.mjs'], register: {} });
    const ok = clean.findings.length === 0 && clean.checked >= 7 && red.findings.some((f) => /STALE .*"saStale".*src\/a\.js/.test(f));
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok    ' : 'FAILED'} two declarators on one line keep their own files (${clean.findings.length} red clean, ${red.findings.length} red planted)${ok ? '' : ': ' + JSON.stringify({ clean: clean.findings, red: red.findings })}`);
  }
  /* WHICH LISTS (2026-11-26): the shape, the name and the register each bring a list in, under any name. The first
     case is red only when a list under a new name is read: the old name-only reading left FAULTS unread, green. */
  writeFileSync(join(dir, 'supabase', 'migrations', '2026-01-02-n.sql'), 'create function g() returns int as $$ select 5 $$; -- only in n\n');
  {
    const which = (label, extra, want, { register = {}, more = 0 } = {}) => {
      writeFileSync(join(dir, 'tests', 'g.mjs'), guard(CLEAN) + extra);
      const r = check(dir, { files: ['tests/g.mjs'], register });
      const ok = want === 0 ? r.findings.length === 0 && r.checked >= 5 + more : r.findings.some((f) => want.test(f));
      if (!ok) bad++;
      console.log(`  ${ok ? 'ok    ' : 'FAILED'} ${label}${want === 0 ? ` — ${r.checked} anchors green` : ' goes red'}${ok ? '' : ': ' + JSON.stringify(r.findings)}`);
    };
    const FAULTS = (a) => `const FAULTS = [\n  ['f1', 'src/a.js', '${a}', ''],\n  ['f2', 'src/a.js', 'export const x = 1;', ''],\n];\n`;
    which('a stale anchor in a list under a new name (its shape reads it)', FAULTS('export const z = 3;'), /STALE .*FAULTS "f1"/);
    which('the same list with live anchors is read and green', FAULTS('export const y = 2;'), 0, { more: 2 });
    which('a self-check silencer pair by its name (GATE_BLIND)', "const GATE_BLIND = ['select 8', 'select 0'];\n", /STALE .*GATE_BLIND/);
    const BODY = "const BODY = { a: { find: 'select 6', repl: 'x' } };\n";
    which('a list the header registers (`// mutant-lists: BODY`)', '// mutant-lists: BODY\n' + BODY, /STALE .*BODY/);
    which('a list its REGISTERED row registers', BODY, /STALE .*BODY/, { register: { 'tests/g.mjs': ['BODY'] } });
    which('the same list with no register is not a mutant list', BODY, 0);
    which('a registered name with no such list', '// mutant-lists: GONE\n', /REGISTER .*names GONE/);
    which('a REGISTERED row for a file that is gone', '', /REGISTER tests\/gone\.mjs/, { register: { 'tests/gone.mjs': ['X'] } });
    which('a `not` with no why', '// mutant-lists: not FAULTS\n' + FAULTS('nope'), /REGISTER .*is not/);
    which('`not … — why` takes out a list its shape misreads', '// mutant-lists: not APPENDS — each plant appends its line\n'
      + "const APPENDS = [['p', 'src/a.js', 'an appended line', 'x']];\n", 0);
    which('one lone `{ file, from, to }` is not a list', "const hk = { file: 'src/a.js', from: 'not on this tree', to: 'x' };\n", 0);
    which('`[test, "CONTROL: …", []]` plants nothing (bands.mjs)', "const MUT = [\n  ['src/a.js', 'CONTROL: the clean plant', []],\n"
      + "  ['tests/g.mjs', 'real', [['src/a.js', 'export const x = 1;', 'x']]],\n];\n", 0, { more: 1 });
    const KEYED = (a) => `const MIG2 = '2026-01-02-n.sql';\nconst MUTATIONS = { k: { file: MIG, pairs: [['select 1', 'x']], mig2Pairs: [['${a}', 'y']] } };\n`;
    which('`mig2Pairs` patches MIG2, not the entry\'s own file', KEYED('only in n'), 0, { more: 2 });
    which('a stale `mig2Pairs` anchor goes red against MIG2', KEYED('select 1 $$'), /STALE .*MUTATIONS .*"select 1 \$\$".*2026-01-02-n\.sql/);
  }
  /* the CRLF arm: a CRLF checkout must not read as stale */
  writeFileSync(join(dir, 'src', 'a.js'), 'export const x = 1;\r\nexport const y = 2;\r\nconst pad = 0; const pad = 0;\r\n');
  run('a CRLF target with an LF multi-line anchor', CLEAN + "\n  ['crlf', 'src/a.js', 'x = 1;\\nexport', ''],", 0);
  /* --for scopes to one file */
  {
    writeFileSync(join(dir, 'tests', 'g.mjs'), guard(CLEAN + "\n  ['stale', 'src/a.js', 'nope nope', ''],"));
    const a = check(dir, { files: ['tests/g.mjs'], register: {}, only: 'src/a.js' }).findings.length;
    const b = check(dir, { files: ['tests/g.mjs'], register: {}, only: 'src/b.js' }).findings.length;
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
