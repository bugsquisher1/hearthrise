#!/usr/bin/env node
// tools/guard-anchors.mjs — A LANE RE-PROVES THE GUARDS WHOSE MUTANTS IT MOVED (b569).
//
// THE INCIDENT. A lane rewrote src/net/gold.js and went green in tools/lane-done.mjs,
// whose step list is fixed. The edit removed the line one of tests/envelope-frame-gate's
// --selftest mutants anchors on, and only .github/workflows/smoke.yml runs that
// selftest — so the lane learned it was red on GitHub, after the push. A mutant anchor
// is a dependency of the guard on another file's bytes, and nothing tracked it.
//
// THE MAP, DERIVED (never a hand list). For every tests/*.mjs and tools/*.mjs that
// BRANCHES on --selftest or --mutate (the same detector guard-hygiene's NON-VACUITY
// rule uses), the guard's source is lexed — comments skipped, strings, template
// chunks and regex literals collected — and:
//   REFERENCED  every string that resolves to a repo file (from the root or from the
//               guard's own directory, plus `join(ROOT, 'a', 'b.js')` argument runs);
//   ANCHORED    a referenced file is anchored when one of the guard's literal chunks
//               (>= 10 chars) occurs in it, or one of its regex literals matches it —
//               at the lane's merge base OR at HEAD, so an edit that DELETES the
//               anchor (the incident) still triggers. A guard none of whose
//               referenced files carries a literal keeps every referenced file: the
//               conservative direction, because an anchor built at runtime is still
//               an anchor.
//   DECLARED    `// mutant-anchors: <path> <dir/> …` in the guard adds to the derived
//               set (for anchors the lexer cannot see: `SRC('net/accrue.js')`,
//               `new URL('live.js', NET)`); `// mutant-anchors: none — <reason>` says
//               the proof plants into fixtures only. A path that does not exist fails.
//   MISSING     a proof-capable guard with no derivable file and no declaration is a
//               FAILURE, not a skip: "nothing to re-prove" must be a written decision.
// The guard's own file is always an anchor (an edited guard re-proves itself).
//
// MIGRATIONS. A changed supabase/migrations/*.sql also re-runs, plainly, every chain-
// replay guard whose SQL names an object that migration creates/alters/drops/grants
// on, plus any guard's declared `// migration-arm: <flag> <object>…` (see
// migrationSteps — the 2026-10-11 name-moderation miss).
//
// WHICH ARM. The proof flag(s) smoke.yml registers for the file; if none, --selftest
// when the file branches on it, else --mutate. A guard whose proof writes into the
// working tree (it imports tests/mutation-safety.mjs, writes without a temp dir, or
// declares `// mutant-writes-tree`) is marked SOLO: lane-done runs it after the pool
// drains, alone, so no concurrent guard reads a planted defect.
//
//   node tools/guard-anchors.mjs                    the catalogue (exit 1 on a MISSING)
//   node tools/guard-anchors.mjs --for <file> …     which proofs a change to <file> re-runs
//   node tools/guard-anchors.mjs --changed          the same, for this lane's diff
//   node tools/guard-anchors.mjs --unregistered     proof arms CI never runs
//   node tools/guard-anchors.mjs --selftest         mutation proof of this file and of
//                                                   lane-done's scoped step, end to end
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { implementsFlag } from '../tests/guard-hygiene.mjs';
import { parseWorkflow, flatSteps } from '../tests/run-ci-local.mjs';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PROOF_FLAGS = ['--selftest', '--mutate'];
const GUARD_DIRS = ['tests', 'tools'];
const MIN_LITERAL = 10;
const SKIP_DIRS = new Set(['node_modules', '.git', '.pglite-cache', '.ci-local']);

// ── THE LEXER ──────────────────────────────────────────────────────────────
/* Comments are skipped, so a header that NAMES a file is not a dependency on it,
   and an apostrophe in prose cannot misalign every quote after it (the first,
   regex-only draft of this file lost src/net/gold.js from envelope-frame-gate for
   exactly that reason). Template literals yield their static chunks; `${…}` is
   lexed recursively. A `/` opens a regex only where an operand is expected. */
const REGEX_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '\n']);
const REGEX_KEYWORDS = /(?:^|[^\w$])(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/;

function lex(src) {
  const strings = [];
  const regexes = [];
  let i = 0;
  const n = src.length;
  let prev = '\n';           // last significant character outside a token
  let prevWord = '';
  const readEscaped = (q) => {
    let out = '';
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\' && i + 1 < n) {
        const c = src[i + 1];
        out += c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c === '\n' ? '' : c;
        i += 2;
      } else if (src[i] === '\n' && q !== '`') { break; } else { out += src[i++]; }
    }
    i++;
    return out;
  };
  const template = () => {
    i++;
    let chunk = '';
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\' && i + 1 < n) {
        const c = src[i + 1];
        chunk += c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c;
        i += 2;
      } else if (src[i] === '$' && src[i + 1] === '{') {
        strings.push(chunk); chunk = '';
        i += 2;
        let depth = 1;
        const start = i;
        while (i < n && depth > 0) {
          const ch = src[i];
          if (ch === '`') { i = skipTemplate(src, i); continue; }
          if (ch === '\'' || ch === '"') {
            i++;
            while (i < n && src[i] !== ch && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
            i++;
            continue;
          }
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
          i++;
        }
        const inner = lex(src.slice(start, i - 1));
        strings.push(...inner.strings); regexes.push(...inner.regexes);
      } else { chunk += src[i++]; }
    }
    i++;
    strings.push(chunk);
  };
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '\'' || c === '"') { strings.push(readEscaped(c)); prev = 'a'; prevWord = ''; continue; }
    if (c === '`') { template(); prev = 'a'; prevWord = ''; continue; }
    if (c === '/' && (REGEX_AFTER.has(prev) || REGEX_KEYWORDS.test(prevWord))) {
      let j = i + 1; let inClass = false; let body = '';
      while (j < n && src[j] !== '\n') {
        const ch = src[j];
        if (ch === '\\') { body += ch + (src[j + 1] || ''); j += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) break;
        body += ch; j++;
      }
      if (src[j] === '/') {
        j++;
        let flags = '';
        while (j < n && /[a-z]/.test(src[j])) flags += src[j++];
        regexes.push({ source: body, flags });
        i = j; prev = 'a'; prevWord = '';
        continue;
      }
    }
    if (/\s/.test(c)) { if (c === '\n' && prev !== 'a') prev = '\n'; i++; continue; }
    if (/[\w$]/.test(c)) {
      let w = '';
      while (i < n && /[\w$]/.test(src[i])) w += src[i++];
      prev = 'a'; prevWord = w;
      continue;
    }
    prev = c; prevWord = ''; i++;
  }
  return { strings, regexes };
}

function skipTemplate(src, at) {
  let i = at + 1;
  while (i < src.length && src[i] !== '`') {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === '$' && src[i + 1] === '{') {
      let depth = 1; i += 2;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        else if (src[i] === '`') { i = skipTemplate(src, i); continue; }
        i++;
      }
      continue;
    }
    i++;
  }
  return i + 1;
}

// ── THE MAP ────────────────────────────────────────────────────────────────
const isFile = (abs) => { try { return statSync(abs).isFile(); } catch { return false; } };
const isDir = (abs) => { try { return statSync(abs).isDirectory(); } catch { return false; } };
const toRel = (root, abs) => relative(root, abs).replace(/\\/g, '/');

/** `// mutant-anchors: a b dir/` and `// mutant-anchors: none — why`, and the solo marker. */
function directives(src) {
  const entries = [];
  let none = null;
  for (const m of src.matchAll(/^\s*\/\/\s*mutant-anchors:\s*(.+?)\s*$/gm)) {
    const body = m[1];
    const nm = /^none\b\s*(?:[—–-]+\s*)?(.*)$/.exec(body);
    if (nm) none = nm[1].trim();
    else entries.push(...body.split(/[\s,]+/).filter(Boolean));
  }
  return { entries, none, writesTree: /^\s*\/\/\s*mutant-writes-tree\b/m.test(src) };
}

/** Every repo file (relative, forward slashes) the guard's code names. */
function referencedFiles(root, rel, src, lexed = lex(src)) {
  const out = new Set();
  const dir = dirname(join(root, rel));
  const add = (abs) => { if (isFile(abs)) { const r = toRel(root, abs); if (!r.startsWith('..')) out.add(r); } };
  const pathy = /^[\w./@-]+\.(?:m?js|sql|json|ts|css|html|toml|ya?ml|sh|md)$/;
  for (let s of lexed.strings) {
    s = s.split('?')[0];
    if (!pathy.test(s.replace(/^\/+/, ''))) continue;
    if (s.startsWith('./') || s.startsWith('../')) { add(resolve(dir, s)); add(resolve(root, s)); } else add(join(root, s.replace(/^\/+/, '')));
  }
  /* join(ROOT, 'src', 'net', 'gold.js') — the argument run, resolved from the root
     and from the guard's directory (join(HERE, '..', 'src', …)). */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of code.matchAll(/\b(?:join|resolve)\(\s*[\w.$]+\s*,((?:\s*['"][^'"\n]+['"]\s*,?)+)\)/g)) {
    const parts = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
    add(join(root, ...parts)); add(join(dir, ...parts));
  }
  out.delete(rel);
  return [...out].sort();
}

function compiledRegexes(lexed) {
  const out = [];
  for (const r of lexed.regexes) {
    if (r.source.length < 8) continue;
    try { out.push(new RegExp(r.source, r.flags.replace(/[gy]/g, ''))); } catch { /* not a regex after all */ }
  }
  return out;
}

/** Does any of the guard's literals anchor in `text`? CRLF-normalised: a CRLF checkout
    must not hide an anchor written on a Unix box (artisan-accrual's own lesson). */
function anchorsIn(text, lits, res) {
  const t = text.replace(/\r\n/g, '\n');
  return lits.some((s) => t.includes(s)) || res.some((r) => r.test(t));
}

/** Read the guard and the tree; return its catalogue entry. `contentOf(rel)` yields every
    version of a file the anchor test must consider (HEAD, and the base for a changed file). */
function guardEntry(root, rel, { contentOf, registered = new Map() } = {}) {
  const src = readFileSync(join(root, rel), 'utf8');
  const flags = PROOF_FLAGS.filter((f) => implementsFlag(src, f));
  if (!flags.length) return null;
  const lexed = lex(src);
  const dir = directives(src);
  const errors = [];
  const referenced = referencedFiles(root, rel, src, lexed);
  /* A path is a REFERENCE, not an anchor: 'src/net/gold.js' occurs in gold.js's own
     header, and would make every file a guard names look anchored. */
  const lits = [...new Set(lexed.strings.filter((s) => s.trim().length >= MIN_LITERAL
    && !/^\/?[\w./@-]+\.(?:m?js|sql|json|ts|css|html|toml|ya?ml|sh|md)$/.test(s.split('?')[0])))];
  const res = compiledRegexes(lexed);
  const read = contentOf || ((f) => { try { return [readFileSync(join(root, f), 'utf8')]; } catch { return []; } });
  let anchored = referenced.filter((f) => read(f).some((t) => anchorsIn(t, lits, res)));
  const how = anchored.length ? 'derived' : referenced.length ? 'referenced' : (dir.entries.length ? 'declared' : (dir.none !== null ? 'none' : 'missing'));
  if (!anchored.length) anchored = referenced;
  const declared = [];
  for (const e of dir.entries) {
    const abs = join(root, e);
    if (e.endsWith('/') ? isDir(abs) : isFile(abs)) declared.push(e);
    else errors.push(`declares mutant-anchor '${e}', which does not exist`);
  }
  if (dir.none !== null && !dir.none) errors.push('declares `mutant-anchors: none` with no reason');
  if (how === 'missing') {
    errors.push('has a ' + flags.join('/') + ' proof but no derivable anchor file and no `// mutant-anchors:` '
      + 'declaration — declare the files its mutants plant into, or `none — <reason>`');
  }
  const regFlags = registered.get(rel) || [];
  const arms = regFlags.length ? regFlags : [flags.includes('--selftest') ? '--selftest' : '--mutate'];
  const writes = /\bwrite(?:File)?(?:Sync)?\s*\(|\bcopyFile(?:Sync)?\s*\(|\brename(?:Sync)?\s*\(/.test(src)
    && !/\bmkdtemp(?:Sync)?\s*\(|\btmpdir\s*\(/.test(src);
  const solo = dir.writesTree || /['"]\.\/mutation-safety\.mjs['"]/.test(src) || writes;
  return { guard: rel, flags, arms, how, anchors: [...new Set([...anchored, ...declared])].sort(), errors, solo,
    none: dir.none, registered: regFlags };
}

/** guard file -> proof flags registered for it in smoke.yml (the arms CI runs). */
function registeredProofArms(root) {
  const text = readFileSync(join(root, '.github', 'workflows', 'smoke.yml'), 'utf8');
  const map = new Map();
  for (const s of flatSteps(parseWorkflow(text))) {
    for (const cmd of s.run) {
      for (const seg of cmd.split(/&&|\|\||;/)) {
        const m = /\bnode\s+((?:tests|tools)\/[\w.-]+\.mjs)((?:\s+[^\s]+)*)/.exec(seg);
        if (!m) continue;
        const flags = PROOF_FLAGS.filter((f) => new RegExp(f.replace(/-/g, '\\-') + '(?![\\w-])').test(m[2]));
        if (!flags.length) continue;
        const have = map.get(m[1]) || [];
        for (const f of flags) if (!have.includes(f)) have.push(f);
        map.set(m[1], have);
      }
    }
  }
  return map;
}

function proofGuards(root) {
  const out = [];
  for (const d of GUARD_DIRS) {
    for (const f of readdirSync(join(root, d)).filter((x) => x.endsWith('.mjs')).sort()) out.push(`${d}/${f}`);
  }
  return out;
}

function catalogue(root = ROOT, opts = {}) {
  const registered = opts.registered || registeredProofArms(root);
  return proofGuards(root).map((g) => guardEntry(root, g, { ...opts, registered })).filter(Boolean);
}

// ── THE LANE'S DIFF ────────────────────────────────────────────────────────
function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1e8 });
  return r.status === 0 ? r.stdout : null;
}

/** The merge base this lane is measured against: origin/main, else main. */
function laneBase(root) {
  for (const ref of ['origin/main', 'main']) {
    const b = git(root, ['merge-base', ref, 'HEAD']);
    if (b) return b.trim();
  }
  return null;
}

/** Committed (base...HEAD), staged, unstaged and untracked paths, forward slashes. */
function laneChanges(root, base) {
  const out = new Set();
  const add = (txt) => { for (const l of (txt || '').split('\n')) if (l.trim()) out.add(l.trim().replace(/\\/g, '/')); };
  add(git(root, ['diff', '--name-only', base, 'HEAD']));
  add(git(root, ['diff', '--name-only', 'HEAD']));
  add(git(root, ['ls-files', '--others', '--exclude-standard']));
  return [...out].sort();
}

/** Every version of `rel` the anchor test reads: HEAD's bytes and, for a changed file, the base's. */
function versionsReader(root, base, changed) {
  const set = new Set(changed);
  const cache = new Map();
  return (rel) => {
    if (cache.has(rel)) return cache.get(rel);
    const v = [];
    try { v.push(readFileSync(join(root, rel), 'utf8')); } catch { /* deleted in the lane */ }
    if (base && set.has(rel)) { const b = git(root, ['show', `${base}:${rel}`]); if (b !== null) v.push(b); }
    cache.set(rel, v);
    return v;
  };
}

/** The catalogue entries whose anchors a changed file touches (a dir anchor covers its subtree). */
function triggered(entries, changed) {
  const hit = [];
  for (const e of entries) {
    const why = changed.filter((c) => c === e.guard || e.anchors.some((a) => (a.endsWith('/') ? c.startsWith(a) : c === a)));
    if (why.length) hit.push({ ...e, because: why });
  }
  return hit;
}

// ── MIGRATION SCOPE (b569, the second miss) ───────────────────────────────
/* Name-moderation's migration added a charset check to `clans`; tests/vigour.mjs
   seeds a clan named `__vigour_probe__` and went red, and hr_state_of grew
   `must_rename`, which no-client-copy-of-projection's --execute pin refuses. Both
   ran only in GitHub's replay jobs. So a lane that adds or changes a migration
   re-runs every CHAIN-REPLAY guard whose own SQL names an object the migration
   creates, alters, drops, grants on or attaches a policy/trigger/index to — read
   from the migration (HEAD and base) and from the guard's string literals, never
   from a list. A guard may also declare `// migration-arm: <flag> <object> …` to
   run that arm when one of those objects moves (no-client-copy-of-projection:
   `--execute hr_state_of`). */
const MIGRATION_FILE = /^supabase\/(?:migrations\/[^/]+|schema)\.sql$/;
const REPLAY_IMPORT = /from\s+['"]\.\/(?:schema-replay|pglite-chain|pglite-template)\.mjs['"]/;
const NOT_OBJECTS = new Set(['public', 'auth', 'schema', 'extensions', 'storage', 'only', 'if', 'not', 'exists']);

function ddlTargets(sql) {
  const s = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
  const out = new Set();
  const NAME = '((?:"?[\\w]+"?\\.)?"?[\\w]+"?)';
  const KIND = '(?:materialized\\s+view|view|table|function|procedure|type|sequence|index|trigger|domain)';
  const res = [
    new RegExp(`\\bcreate\\s+(?:or\\s+replace\\s+)?(?:unique\\s+)?(?:constraint\\s+)?${KIND}\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?${NAME}`, 'gi'),
    new RegExp(`\\b(?:alter|drop)\\s+${KIND}\\s+(?:concurrently\\s+)?(?:if\\s+exists\\s+)?(?:only\\s+)?${NAME}`, 'gi'),
    new RegExp(`\\b(?:create|alter|drop)\\s+(?:policy|trigger|rule)\\s+(?:if\\s+exists\\s+)?"?\\w+"?[^;]*?\\bon\\s+(?:table\\s+)?${NAME}`, 'gi'),
    new RegExp(`\\bcreate\\s+(?:unique\\s+)?index\\b[^;]*?\\bon\\s+(?:only\\s+)?${NAME}`, 'gi'),
    new RegExp(`\\b(?:grant|revoke)\\b[^;]*?\\bon\\s+(?:table\\s+|function\\s+|procedure\\s+|sequence\\s+)?${NAME}`, 'gi'),
  ];
  for (const re of res) {
    for (const m of s.matchAll(re)) {
      const name = m[1].replace(/"/g, '').split('.').pop().toLowerCase();
      if (name.length >= 3 && !NOT_OBJECTS.has(name)) out.add(name);
    }
  }
  return out;
}

/** `// migration-arm: --flag obj obj …` lines. */
function migrationArms(src) {
  const out = [];
  for (const m of src.matchAll(/^\s*\/\/\s*migration-arm:\s*(--[\w-]+)\s+(.+?)\s*$/gm)) {
    out.push({ arm: m[1], objects: m[2].split(/[\s,]+/).filter(Boolean).map((x) => x.toLowerCase()) });
  }
  return out;
}

/** Plain runs (and declared arms) of the replay guards whose SQL names a moved object. */
function migrationSteps(root, changed, read) {
  const migs = changed.filter((f) => MIGRATION_FILE.test(f));
  if (!migs.length) return [];
  const targets = new Map();      // object -> migration that moved it
  for (const m of migs) for (const text of read(m)) for (const t of ddlTargets(text)) if (!targets.has(t)) targets.set(t, m);
  if (!targets.size) return [];
  const steps = [];
  for (const g of proofGuards(root).filter((x) => x.startsWith('tests/'))) {
    const src = readFileSync(join(root, g), 'utf8');
    for (const a of migrationArms(src)) {
      const hit = a.objects.filter((o) => targets.has(o));
      if (hit.length) steps.push({ guard: g, arm: a.arm, solo: false, because: hit.map((o) => `${targets.get(o)} moves ${o}`), anchors: [] });
    }
    if (!REPLAY_IMPORT.test(src)) continue;
    const sqlText = lex(src).strings.join('\n').toLowerCase();
    const hit = [...targets.keys()].filter((t) => new RegExp(`(?<![\\w])${t}(?![\\w])`).test(sqlText));
    if (hit.length) {
      steps.push({ guard: g, arm: null, solo: false, anchors: [],
        because: hit.slice(0, 3).map((o) => `${targets.get(o)} moves ${o}`).concat(hit.length > 3 ? [`+${hit.length - 3} more`] : []) });
    }
  }
  return steps;
}

/** Everything lane-done needs: the steps to run, and the catalogue's own failures. */
export function scopedProofs(root = ROOT, { changed = null, base = undefined } = {}) {
  const b = base === undefined ? laneBase(root) : base;
  if (!changed && !b) return { error: 'no merge base with origin/main or main — cannot scope the proofs', steps: [], errors: [] };
  const ch = changed || laneChanges(root, b);
  const reader = versionsReader(root, b, ch);
  const entries = catalogue(root, { contentOf: reader });
  const errors = entries.flatMap((e) => e.errors.map((x) => `${e.guard} ${x}`));
  /* HR_SCOPED_GUARDS narrows the run to named guards — set ONLY by this file's own
     end-to-end arm, which must not re-enter itself (its selftest plants into
     src/net/gold.js, which it anchors on) and needs one guard, not the fan-out. */
  const only = (process.env.HR_SCOPED_GUARDS || '').split(',').filter(Boolean);
  const anchorSteps = triggered(entries, ch).flatMap((e) => e.arms.map((arm) => ({
    guard: e.guard, arm, solo: e.solo, because: e.because, anchors: e.anchors,
  })));
  const steps = [...anchorSteps, ...migrationSteps(root, ch, reader)]
    .filter((s) => !only.length || only.includes(s.guard));
  return { base: b, changed: ch, steps, errors };
}

// ── --selftest ─────────────────────────────────────────────────────────────
async function selftest() {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); else console.log('  ok  ' + m); };

  /* L — the lexer. Comments are not dependencies; an apostrophe in prose does not
     misalign the quotes after it; template chunks and regexes are collected. */
  {
    const src = "// see 'src/net/nope.js'\n/* it's prose */ const A = 'src/net/gold.js';\n"
      + "const B = `${ROOT}/src/net/accrue.js`; const r = /if \\(kind === 'artisan'/; const C = \"x's\";";
    const L = lex(src);
    ok(L.strings.includes('src/net/gold.js') && !L.strings.some((s) => s.includes('nope')), 'L1 comments skipped, strings kept');
    ok(L.strings.includes('/src/net/accrue.js'), 'L2 template chunks collected');
    ok(L.regexes.some((r) => r.source.includes("kind === 'artisan'")), 'L3 regex literal collected');
    ok(L.strings.includes("x's"), 'L4 quote alignment survives an apostrophe in a comment');
  }

  /* M — the map, against the real tree: the incident guard must list the incident file. */
  const entries = catalogue(ROOT);
  const efg = entries.find((e) => e.guard === 'tests/envelope-frame-gate.mjs');
  ok(efg && efg.anchors.includes('src/net/gold.js'), 'M1 envelope-frame-gate anchors on src/net/gold.js (the b569 incident)');
  const aa = entries.find((e) => e.guard === 'tests/artisan-accrual.mjs');
  ok(aa && aa.anchors.includes('src/net/activity.js') && aa.solo, 'M2 artisan-accrual anchors on src/net/activity.js and runs SOLO (it plants into the tree)');
  ok(entries.every((e) => !e.errors.length), 'M3 every proof-capable guard has a derivable or declared anchor set'
    + (entries.some((e) => e.errors.length) ? ': ' + entries.filter((e) => e.errors.length).map((e) => e.guard).join(', ') : ''));

  /* X — a MISSING declaration is a failure, a declared one is not, a ghost path is.
     D — the base: an edit that DELETES the anchor must still trigger. A probe guard
     names two files and anchors once in each; a reader serves gold.js WITHOUT its
     anchor at HEAD, and with it only at the base. */
  {
    const tmpRel = 'tests/__guard-anchors-probe.mjs';
    const write = (await import('node:fs')).writeFileSync;
    const rm = (await import('node:fs')).rmSync;
    const body = "if (process.argv.includes('--selftest')) { console.log(1); }\n";
    try {
      write(join(ROOT, tmpRel), body);
      ok(guardEntry(ROOT, tmpRel).errors.some((e) => /no derivable anchor/.test(e)), 'X1 a proof guard with no anchors and no declaration FAILS');
      write(join(ROOT, tmpRel), '// mutant-anchors: none — plants into fixtures only\n' + body);
      ok(!guardEntry(ROOT, tmpRel).errors.length, 'X2 `mutant-anchors: none — <reason>` is accepted');
      write(join(ROOT, tmpRel), '// mutant-anchors: src/net/no-such-file.js\n' + body);
      ok(guardEntry(ROOT, tmpRel).errors.some((e) => /does not exist/.test(e)), 'X3 a declared ghost path FAILS');
      write(join(ROOT, tmpRel), '// mutant-anchors: src/net/\n' + body);
      const t = triggered([guardEntry(ROOT, tmpRel)], ['src/net/gold.js']);
      ok(t.length === 1, 'X4 a declared directory anchor covers its subtree');
      const anchor = 'export function resetGold() { pending = []; last = null; resetFrameGate(); }';
      write(join(ROOT, tmpRel), "const F = ['src/net/gold.js', 'src/net/accrue.js'];\n"
        + `const M = [${JSON.stringify(anchor)}, 'export function applyEnvelope(G, res) {'];\n` + body);
      const gold = readFileSync(join(ROOT, 'src/net/gold.js'), 'utf8');
      const stripped = gold.split(anchor).join('export function resetGold(){}');
      const real = (f) => [readFileSync(join(ROOT, f), 'utf8')];
      const headOnly = (f) => (f === 'src/net/gold.js' ? [stripped] : real(f));
      const both = (f) => (f === 'src/net/gold.js' ? [stripped, gold] : real(f));
      const a = guardEntry(ROOT, tmpRel, { contentOf: headOnly });
      const b = guardEntry(ROOT, tmpRel, { contentOf: both });
      ok(gold.includes(anchor) && !a.anchors.includes('src/net/gold.js') && b.anchors.includes('src/net/gold.js'),
        'D1 an anchor the lane DELETED is found at the base (HEAD alone would have lost the edge)');
    } finally { rm(join(ROOT, tmpRel), { force: true }); }
  }

  /* G — the migration scope, on the two shapes that missed on 2026-10-11: a charset
     constraint on `clans` (tests/vigour.mjs seeds one) and an hr_state_of rewrite
     (the projection's --execute pin). A comment naming an object is not DDL. */
  {
    const t = ddlTargets("-- alter table public.ghosts\nalter table if exists public.clans add constraint clans_name_charset check (name ~ '^[a-z]');\n"
      + 'create or replace function public.hr_state_of(p_slot int) returns jsonb language sql as $$ select 1 $$;\n'
      + 'create index if not exists x_idx on public.player_ledger (user_id);\ngrant execute on function public.hr_rest(int) to authenticated;');
    ok(t.has('clans') && t.has('hr_state_of') && t.has('player_ledger') && t.has('hr_rest') && !t.has('ghosts'),
      `G1 DDL targets parsed (${[...t].join(', ')})`);
    const fake = 'supabase/migrations/2099-01-01-name-moderation-probe.sql';
    const read = (f) => (f === fake
      ? ["alter table public.clans add constraint clans_name_charset check (name ~ '^[A-Za-z ]+$');\n"
        + 'create or replace function public.hr_state_of(p_slot int) returns jsonb language sql as $$ select 1 $$;']
      : []);
    const st = migrationSteps(ROOT, [fake], read);
    ok(st.some((s) => s.guard === 'tests/vigour.mjs' && s.arm === null),
      'G2 a migration that alters clans re-runs tests/vigour.mjs (plain)');
    ok(st.some((s) => s.guard === 'tests/no-client-copy-of-projection.mjs' && s.arm === '--execute'),
      'G3 a migration that rewrites hr_state_of runs no-client-copy-of-projection --execute');
    ok(!migrationSteps(ROOT, ['src/net/gold.js'], read).length, 'G4 no migration in the diff, no replay steps');
  }

  /* E — END TO END: plant an anchor-breaking edit, lane-done's scoped step goes RED;
     restore it, the same step goes green (the control). The plant is one byte of
     whitespace inside envelope-frame-gate's gold_copy_restored anchor — the exact
     shape of the incident — snapshotted by tests/mutation-safety.mjs, which restores
     on every exit path and verifies by sha256. */
  {
    const { snapshot, assertNoResidue, finish } = await import('../tests/mutation-safety.mjs');
    const { writeFileSync } = await import('node:fs');
    const file = 'src/net/gold.js';
    const from = 'export function resetGold() { pending = []; last = null; resetFrameGate(); }';
    const to = 'export function resetGold() {  pending = []; last = null; resetFrameGate(); }';
    assertNoResidue([{ file, from, to }]);
    const orig = snapshot(file);
    const lane = (extra) => spawnSync(process.execPath, [join(ROOT, 'tools/lane-done.mjs'), '--scoped-only', '--no-cache', '--changed', file, ...extra],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8,
        env: { ...process.env, HR_SCOPED_GUARDS: 'tests/envelope-frame-gate.mjs' } });
    let planted = null; let control = null;
    try {
      writeFileSync(join(ROOT, file), orig.split(from).join(to));
      planted = lane([]);
    } finally { writeFileSync(join(ROOT, file), orig); }
    control = lane([]);
    const plantedOut = (planted.stdout || '') + (planted.stderr || '');
    ok(planted.status !== 0 && /RED\s+node tests\/envelope-frame-gate\.mjs --selftest/.test(plantedOut),
      `E1 an anchor-breaking edit to ${file} turns lane-done RED on envelope-frame-gate --selftest (exit ${planted.status})`);
    ok(control.status === 0 && /ok\s+node tests\/envelope-frame-gate\.mjs --selftest/.test(control.stdout || ''),
      `E2 CONTROL: the same scoped run on the unplanted tree is green (exit ${control.status})`);
    if (fails.length) { for (const f of fails) console.log('  x  ' + f); console.log(plantedOut.split('\n').slice(-12).join('\n')); finish(1); }
    console.log(`\nguard-anchors --selftest: all proofs held (${entries.length} proof-capable guards catalogued).`);
    finish(0);
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) {
    await selftest();
  } else if (argv.includes('--why')) {
    /* Which of <guard>'s literals anchor it on <file> — the reading behind one map edge. */
    const [g, f] = argv.slice(argv.indexOf('--why') + 1);
    const L = lex(readFileSync(join(ROOT, g), 'utf8'));
    const text = readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
    for (const s of new Set(L.strings)) if (s.trim().length >= MIN_LITERAL && text.includes(s)) console.log('literal  ' + JSON.stringify(s).slice(0, 140));
    for (const r of compiledRegexes(L)) if (r.test(text)) console.log('regex    /' + r.source.slice(0, 120) + '/');
  } else if (argv.includes('--unregistered')) {
    const entries = catalogue(ROOT);
    const un = entries.filter((e) => !e.registered.length && e.none === null);
    for (const e of un) console.log(`${e.guard} ${e.arms.join(' ')}${e.solo ? '  (solo)' : ''}`);
    console.log(`\n${un.length} of ${entries.length} proof-capable guards have no proof arm in smoke.yml.`);
  } else if (argv.includes('--for') || argv.includes('--changed')) {
    const files = argv.includes('--for') ? argv.slice(argv.indexOf('--for') + 1).filter((a) => !a.startsWith('--')) : null;
    const r = scopedProofs(ROOT, { changed: files });
    if (r.error) { console.log(r.error); process.exit(2); }
    for (const s of r.steps) console.log(`node ${s.guard} ${s.arm || '(plain)'}${s.solo ? '  (solo)' : ''}   <- ${s.because.join(', ')}`);
    for (const e of r.errors) console.log('MISSING ' + e);
    console.log(`\n${r.steps.length} proof arm(s) for ${r.changed.length} changed file(s).`);
    process.exitCode = r.errors.length ? 1 : 0;
  } else {
    const entries = catalogue(ROOT);
    for (const e of entries) {
      console.log(`${e.guard.padEnd(48)} ${e.arms.join(',').padEnd(18)} ${e.how.padEnd(10)} ${e.anchors.length} file(s)${e.solo ? ' solo' : ''}`);
      for (const x of e.errors) console.log('    MISSING ' + x);
    }
    const bad = entries.filter((e) => e.errors.length);
    console.log(`\n${entries.length} proof-capable guards; ${bad.length} without an anchor set.`);
    process.exitCode = bad.length ? 1 : 0;
  }
}
