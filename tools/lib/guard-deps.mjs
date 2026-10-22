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
//             gate re-proves only the guards whose MUTANTS anchor on it.
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
 * The files whose ONLY change is the release cache-buster (`?v=0.2.22` -> `?v=0.2.23`,
 * CLAUDE.md §5). Every release rewrites every ESM import under src/**, so without this
 * every release "touches" every module and re-proves ~190 of ~200 guards: the version
 * string is not a change any mutant can see. Read from one `git diff -U0`; a file that
 * is added, deleted, binary or changes anything else stays a change.
 */
export function cacheBusterOnly(diffText) {
  const VER = /\?v=[0-9A-Za-z._-]+/g;
  /* src/build-info.js carries the same bump as `version:`/`cache:` and the release `date:`. */
  const BUILD_LINE = /^(\s*(?:version|cache|date):\s*)'[0-9.-]+'/;
  const files = new Map();
  let cur = null;
  for (const l of diffText.split('\n')) {
    if (l.startsWith('diff --git ')) {
      const m = / b\/(.+)$/.exec(l);
      cur = { path: m ? m[1] : null, minus: [], plus: [], other: false, hunk: false };
      if (cur.path) files.set(cur.path, cur);
      continue;
    }
    if (!cur) continue;
    /* Before the first @@ a file's header lines (`--- a/x`, `new file mode`); after it, content
       (a removed SQL comment `-- x` reads `--- x` and is content, not a header). */
    if (l.startsWith('@@')) { cur.hunk = true; continue; }
    if (!cur.hunk) { if (/^(new|deleted) file mode|^Binary files |^GIT binary patch/.test(l)) cur.other = true; continue; }
    if (l.startsWith('\\')) continue;                                  // "\ No newline at end of file"
    else if (l[0] === '+' || l[0] === '-') {
      let t = l.slice(1).replace(VER, '?v=');
      if (cur.path === 'src/build-info.js') t = t.replace(BUILD_LINE, "$1''");
      (l[0] === '+' ? cur.plus : cur.minus).push(t);
    }
  }
  const out = new Set();
  for (const f of files.values()) {
    if (f.other || !f.plus.length || f.plus.length !== f.minus.length) continue;
    const a = [...f.plus].sort(); const b = [...f.minus].sort();
    if (a.every((x, i) => x === b[i])) out.add(f.path);
  }
  return out;
}

/**
 * The diff's files. `range` is `base...HEAD`-style (three dots = from the merge
 * base) or `base..HEAD`. `worktree` adds staged, unstaged and untracked paths (a
 * lane's local view); CI passes false so a tree a mutant dirtied cannot move it.
 */
export function changedFiles(root, range, { worktree = true } = {}) {
  const lines = (s) => s.split('\n').map((x) => x.trim().replace(/\\/g, '/')).filter(Boolean);
  const bumpOnly = cacheBusterOnly(git(root, ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', range]));
  const out = new Set(lines(git(root, ['diff', '--name-only', '--no-renames', range])).filter((f) => !bumpOnly.has(f)));
  if (worktree) {
    for (const f of lines(git(root, ['diff', '--name-only']))) out.add(f);
    for (const f of lines(git(root, ['diff', '--name-only', '--cached']))) out.add(f);
    for (const f of lines(git(root, ['ls-files', '--others', '--exclude-standard']))) out.add(f);
  }
  return [...out].sort();
}
