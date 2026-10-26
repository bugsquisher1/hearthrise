// ════════════════════════════════════════════════════════════════════════
// tools/lib/guard-deps.mjs — WHICH GUARDS DOES A DIFF TOUCH (one mapping, two callers).
//
// CLAUDE.md §3.6: "A release runs only the mutation proofs for guards its diff
// touches; the full sweep runs nightly." Two tools answer "which guards does this
// diff touch": tools/guards-for.local.mjs (a lane's local shortlist) and
// tools/mutant-gate.mjs (CI's per-command gate on every --mutate/--selftest step).
// A second copy of the mapping would drift, and a drifted gate skips a proof
// silently, so the mapping lives here and both import it.
//
// THE RULE (moved verbatim from guards-for, plus the helper-import closure):
//   CHANGED   a guard file the diff touches is picked.
//   LOADS     a guard is picked when its source names a changed file (outside
//             tests/ and tools/ .mjs, which reach a guard only by IMPORTS) in a string —
//             an import or a path (`from '../src/core/member.js'`, `'src/core/
//             member.js'`, `join(SRC, 'member.js')`) — matched on the basename +
//             extension, never on a bare mention.
//   IMPORTS   a picked .mjs under tests/ or tools/ is itself a dependency: every
//             file that IMPORTS it is picked too, transitively (a changed
//             tests/_chrome.mjs re-proves every page guard that boots Chromium).
//   MIGRATION a changed supabase/migrations/*.sql picks the two replay guards.
//   HUB       (opt-in, the CI gate only) a file named by more than `hubAt` guards —
//             play.html is named by ~80 page guards — picks none of them by name; the
//             gate re-proves only the guards whose MUTANTS anchor on a LINE the diff
//             really changed (changedLines: a `?v=`-only edit is not a change).
//
// Pure apart from the readers at the bottom; no network, no database.
// ════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// ── the CI gate's command shape (shared with ci-shape and guard-anchors) ────
const GATE_FILE = 'tools/mutant-gate.mjs';
export const GATE_PREFIX = `node ${GATE_FILE} `;
/** A mutation proof: `--mutate` or `--selftest` as a whole flag (`--mutate --shard=1/3` too). */
export const PROOF_FLAG = /(?:^|\s)--(?:mutate|selftest)(?![\w-])/;

export const isGated = (cmd) => typeof cmd === 'string' && cmd.startsWith(GATE_PREFIX);
/** The command the gate wraps (or the command itself when it is not gated). */
export const unwrapGate = (cmd) => (isGated(cmd) ? cmd.slice(GATE_PREFIX.length).trimStart() : cmd);
export const isProofCommand = (cmd) => PROOF_FLAG.test(unwrapGate(cmd));
/** `node tests/x.mjs --mutate` -> `tests/x.mjs`; `bash bump-version.sh --selftest` -> `bump-version.sh`. */
export function guardFileOf(cmd) {
  const m = /^(?:node|bash)\s+(\S+)/.exec(unwrapGate(cmd));
  return m ? m[1].replace(/^\.\//, '') : null;
}

// ── the mapping ─────────────────────────────────────────────────────────────
const REFERABLE = /\.(js|mjs|ts|sql|css|html|json|sh)$/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A string literal naming `path` by basename + extension, or null for a stem too short to mean anything. */
export function refPattern(path) {
  if (!REFERABLE.test(path)) return null;
  const stem = basename(path).replace(/\.(generated\.)?(js|mjs|ts|sql|css|html|json|sh)$/, '');
  if (stem.length < 4) return null;
  /* An import or a path string of the file, not any mention: `from '../src/core/member.js'`, `'src/core/member.js'`. */
  return new RegExp(`['"\`][^'"\`]*${esc(stem)}\\.(?:generated\\.)?(?:js|mjs|ts|sql|css|html|json|sh)`);
}

/** An ESM import of `path` (static or dynamic), by basename. */
function importPattern(path) {
  const stem = basename(path).replace(/\.mjs$/, '');
  return new RegExp(`(?:\\bfrom\\s*|\\bimport\\s*\\(\\s*)['"\`][^'"\`]*\\b${esc(stem)}\\.mjs['"\`]`);
}

const isHelperModule = (p) => /^(tests|tools)\/.+\.mjs$/.test(p);
const CHAIN_REGISTRY = new Set(['tests/schema-apply-order.json']);

/**
 * Every file in `sources` the diff touches, with the reason.
 * @param {string[]} changed   repo-relative, forward slashes
 * @param {Map<string,string>} sources  repo-relative path -> source text (the candidates)
 * @param {{hubAt?: number, hubs?: string[]}} o  a changed file named by more than `hubAt` sources
 *        is a hub: it picks nothing here and is pushed onto `hubs` (the CI gate judges a hub by
 *        the mutants that anchor on it; a lane's plain shortlist keeps the default, no hubs)
 * @returns {Map<string,string>} picked path -> why
 */
export function touchedBy(changed, sources, { hubAt = Infinity, hubs = [] } = {}) {
  const pick = new Map();
  const queue = [];
  const add = (t, why) => { if (pick.has(t)) return; pick.set(t, why); if (isHelperModule(t)) queue.push(t); };
  for (const f of changed) if (sources.has(f)) add(f, 'changed');
  for (const f of changed) {
    /* A changed tests/tools module reaches others only by being IMPORTED (below): a
       guard that names another guard in a message string does not load it. */
    if (isHelperModule(f)) { if (!sources.has(f)) queue.push(f); continue; }
    /* The chain's order file is named by the replay harness every chain guard imports; a new
       entry in it is a new migration, judged by the MIGRATION rule and guard-anchors' per-object
       migration scope — not by re-proving all ~85 replay guards. */
    if (CHAIN_REGISTRY.has(f)) continue;
    const re = refPattern(f);
    if (!re) continue;
    const hits = [...sources].filter(([t, s]) => t !== f && re.test(s)).map(([t]) => t);
    /* A HUB (play.html, named by every page guard) — the caller judges it another way. */
    if (hits.length > hubAt) { hubs.push(f); continue; }
    for (const t of hits) add(t, `loads ${basename(f)}`);
  }
  /* IMPORTS: a picked helper module carries its importers with it. */
  for (let i = 0; i < queue.length; i++) {
    const h = queue[i];
    const re = importPattern(h);
    for (const [t, s] of sources) if (t !== h && re.test(s)) add(t, `imports ${basename(h)} (${pick.get(h)})`);
  }
  if (changed.some((f) => f.startsWith('supabase/migrations/') || CHAIN_REGISTRY.has(f))) {
    for (const t of ['tests/schema-drift.mjs', 'tests/apply-order-honesty.mjs']) if (sources.has(t)) add(t, 'migration changed');
  }
  return pick;
}

// ── readers ─────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['fixtures', 'node_modules', '.git', '.pglite-cache', '.ci-local']);

/* Prose is not a dependency: a header that NAMES a file does not load it, and an apostrophe
   in a comment ("one job's budget ... ci-shape.baseline.json") reads as an opening quote.
   Only comments that START a line are dropped — whole-line `//` and line-leading block
   comments — so no code or string (`'src/**' + '/*.js'`) is ever cut. */
export function stripComments(src) {
  return src.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** tests/**\/*.mjs and tools/**\/*.mjs (fixtures excluded), as path -> code with comments stripped. */
export function guardSources(root, dirs = ['tests', 'tools']) {
  const out = new Map();
  const walk = (rel) => {
    for (const f of readdirSync(join(root, rel))) {
      const p = `${rel}/${f}`;
      const st = statSync(join(root, p));
      if (st.isDirectory()) { if (!SKIP_DIRS.has(f)) walk(p); continue; }
      if (f.endsWith('.mjs')) out.set(p, stripComments(readFileSync(join(root, p), 'utf8')));
    }
  };
  for (const d of dirs) if (existsSync(join(root, d))) walk(d);
  return out;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1e8 }).trim();
}

/**
 * One line with the release cache-buster (CLAUDE.md §5) taken out: every `?v=0.2.22`
 * reads `?v=`, and src/build-info.js's `version:`/`cache:`/`date:` values read ''.
 */
function unbust(path, line) {
  const t = line.replace(/\?v=[0-9A-Za-z._-]+/g, '?v=');
  return path === 'src/build-info.js' ? t.replace(/^(\s*(?:version|cache|date):\s*)'[0-9.-]+'/, "$1''") : t;
}

/* A hunk's removed x added lines are paired by a longest common subsequence; past this many
   cells the whole hunk counts as changed (the safe direction — a proof runs, never skips). */
const LCS_CELLS = 4e6;

/** Which of a hunk's removed (a) and added (b) lines survive pairing by equal unbust()ed text. */
function unpaired(a, b) {
  const n = a.length; const m = b.length;
  if (!n || !m || n * m > LCS_CELLS) return { a: a.map((_, i) => i), b: b.map((_, j) => j) };
  const w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = a[i] === b[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
  }
  const out = { a: [], b: [] };
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) out.a.push(i++); else out.b.push(j++);
  }
  while (i < n) out.a.push(i++);
  while (j < m) out.b.push(j++);
  return out;
}

/** [1,2,3,7] -> [[1,3],[7,7]] */
const toRanges = (ns) => ns.reduce((r, x) => {
  const last = r[r.length - 1];
  if (last && last[1] === x - 1) last[1] = x; else r.push([x, x]);
  return r;
}, []);

/**
 * THE REAL CHANGES, LINE BY LINE, from one `git diff -U0`: path -> { whole, base, head }, where
 * `base`/`head` are the 1-based line ranges of the base/HEAD side that changed once the
 * cache-buster is taken out (unbust). A line whose only change is its `?v=` is paired with its
 * twin and is not a change, so a release that bumps every `?v=` in play.html AND adds one
 * modulepreload line has changed exactly that one line. `whole` = added, deleted or binary
 * (no line view). Every release rewrites every ESM import under src/**: without this, every
 * release "touches" every module and re-proves ~190 of ~200 guards.
 */
export function changedLines(diffText) {
  const files = new Map();
  let cur = null;
  const flush = () => {
    if (!cur || !cur.hunk) return;
    const u = unpaired(cur.minus.map((x) => x[1]), cur.plus.map((x) => x[1]));
    for (const i of u.a) cur.baseLines.push(cur.minus[i][0]);
    for (const j of u.b) cur.headLines.push(cur.plus[j][0]);
    cur.minus = []; cur.plus = [];
  };
  for (const l of diffText.split('\n')) {
    if (l.startsWith('diff --git ')) {
      flush();
      const m = / b\/(.+)$/.exec(l);
      cur = { path: m ? m[1] : null, minus: [], plus: [], baseLines: [], headLines: [], whole: false, hunk: false, b: 0, h: 0 };
      if (cur.path) files.set(cur.path, cur);
      continue;
    }
    if (!cur) continue;
    /* Before the first @@ a file's header lines (`--- a/x`, `new file mode`); after it, content
       (a removed SQL comment `-- x` reads `--- x` and is content, not a header). */
    const at = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (at) { flush(); cur.hunk = true; cur.b = Number(at[1]); cur.h = Number(at[2]); continue; }
    if (!cur.hunk) { if (/^(new|deleted) file mode|^Binary files |^GIT binary patch/.test(l)) cur.whole = true; continue; }
    if (l.startsWith('\\')) continue;                                  // "\ No newline at end of file"
    if (l[0] === '-') cur.minus.push([cur.b++, unbust(cur.path, l.slice(1))]);
    else if (l[0] === '+') cur.plus.push([cur.h++, unbust(cur.path, l.slice(1))]);
  }
  flush();
  const out = new Map();
  for (const f of files.values()) {
    /* A mode-only change has no hunk and no lines: it is a change, judged whole. */
    const whole = f.whole || !f.hunk;
    out.set(f.path, { whole, base: whole ? [] : toRanges(f.baseLines), head: whole ? [] : toRanges(f.headLines) });
  }
  return out;
}

/** The files whose ONLY change is the release cache-buster (`?v=0.2.22` -> `?v=0.2.23`). */
export function cacheBusterOnly(diffText) {
  const out = new Set();
  for (const [p, r] of changedLines(diffText)) if (!r.whole && !r.base.length && !r.head.length) out.add(p);
  return out;
}

const listLines = (s) => s.split('\n').map((x) => x.trim().replace(/\\/g, '/')).filter(Boolean);

/**
 * A committed range's files (the cache-buster-only ones dropped) and its real changed
 * lines (changedLines) — one `git diff -U0`, one `--name-only`.
 */
export function committedDiff(root, range) {
  const regions = changedLines(git(root, ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', range]));
  const bumpOnly = new Set([...regions].filter(([, r]) => !r.whole && !r.base.length && !r.head.length).map(([p]) => p));
  const files = listLines(git(root, ['diff', '--name-only', '--no-renames', range])).filter((f) => !bumpOnly.has(f)).sort();
  return { files, regions };
}

/**
 * The diff's files. `range` is `base...HEAD`-style (three dots = from the merge
 * base) or `base..HEAD`. `worktree` adds staged, unstaged and untracked paths (a
 * lane's local view); CI passes false so a tree a mutant dirtied cannot move it.
 */
export function changedFiles(root, range, { worktree = true } = {}) {
  const out = new Set(committedDiff(root, range).files);
  if (worktree) {
    for (const f of listLines(git(root, ['diff', '--name-only']))) out.add(f);
    for (const f of listLines(git(root, ['diff', '--name-only', '--cached']))) out.add(f);
    for (const f of listLines(git(root, ['ls-files', '--others', '--exclude-standard']))) out.add(f);
  }
  return [...out].sort();
}
