// ════════════════════════════════════════════════════════════════════════
// tools/lib/mutant-scope.mjs — WHICH OF A GUARD'S MUTANTS DOES THIS DIFF TOUCH.
//
// tools/mutant-gate.mjs decides per COMMAND; a guard with one long mutant list
// (tests/hunt-screen.mjs: 63 mutants, one ~60 s page boot each) was still re-proved
// whole whenever its own file changed — which is every release, because new rules
// land in it. This narrows a gated run to the mutants the diff can have moved:
//
//   ANCHOR      a mutant whose patched file (entry[1]) the diff changes
//   DEFINITION  a mutant added or edited in the guard's own MUTANTS list
//   HARNESS     anything else in the guard file, or a tests/ helper or fixture it
//               loads (tests/_client-harness.mjs, tests/fixtures/hunt-envelope.json,
//               this file) -> EVERY mutant
//
// The list is the guard's `const MUTANTS = [ … ];` literal (an array of
// [name, file, from, to] entries), read from the guard's source at HEAD and at the
// diff's base. Anything that cannot be read — no scope from the gate (a nightly,
// a manual or a local run), no base, an unparsable list — is EVERY mutant: the
// scope only ever narrows a run the gate already decided is a push.
//
// The gate hands the scope over as HR_MUTANT_SCOPE: the path of its per-job plan,
// `{ base, changed }`.
// ════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { touchedBy, guardSources, stripComments } from './guard-deps.mjs';

const START = 'const MUTANTS = [';

/** { block, rest } — the MUTANTS literal, and the source with the literal blanked; null when absent. */
export function splitMutants(src) {
  const text = src.replace(/\r\n/g, '\n');
  const at = text.indexOf(START);
  if (at < 0) return null;
  const end = text.indexOf('\n];', at);
  if (end < 0) return null;
  return { block: text.slice(at + START.length, end), rest: text.slice(0, at) + START + '/* mutants */' + text.slice(end) };
}

/** The list as data. The literal holds only strings and arrays (no code), so it evaluates alone. */
export function parseMutants(block) {
  // eslint-disable-next-line no-new-func
  const list = new Function(`return [${block}\n];`)();
  if (!Array.isArray(list) || !list.every((m) => Array.isArray(m) && typeof m[0] === 'string' && typeof m[1] === 'string')) {
    throw new Error('MUTANTS is not a list of [name, file, …] entries');
  }
  return list;
}

/**
 * @param {object} o
 * @param {string} o.guard          repo-relative guard path
 * @param {string} o.root
 * @param {string[]|null} o.changed the diff (null = no scope: every mutant)
 * @param {string|null} o.base      the diff's base commit (needed when the guard itself changed)
 * @param {string} [o.headSource]   injectable for the selftest
 * @param {string|null} [o.baseSource]
 * @param {Map<string,string>} [o.sources]  tests/tools sources (guard-deps), injectable
 * @returns {{ all: true, why: string } | { all: false, keep: Set<string>, why: Map<string,string> }}
 */
export function scopeMutants({ guard, root, changed, base = null, headSource, baseSource, sources }) {
  if (!Array.isArray(changed)) return { all: true, why: 'no gate scope — the full sweep' };
  const head = splitMutants(headSource ?? readFileSync(join(root, guard), 'utf8'));
  if (!head) return { all: true, why: `${guard} has no \`${START}\` list` };
  let list;
  try { list = parseMutants(head.block); } catch (e) { return { all: true, why: `MUTANTS unreadable (${e.message})` }; }

  /* HARNESS (1): a tests/ or tools/ helper or fixture the guard's own code — not its mutant
     strings, which name the files they patch — loads, directly or through an import. */
  const src = new Map(sources || guardSources(root));
  src.set(guard, stripComments(head.rest));
  const helpers = changed.filter((f) => f !== guard && /^(tests|tools)\//.test(f));
  const viaHelper = touchedBy(helpers, src).get(guard);
  if (viaHelper) return { all: true, why: `the harness moved: ${viaHelper}` };

  const keep = new Map();
  /* DEFINITION and HARNESS (2): the guard file itself changed. */
  if (changed.includes(guard)) {
    let was = baseSource;
    if (was === undefined) {
      if (!base) return { all: true, why: `${guard} changed and there is no base to compare` };
      try { was = execFileSync('git', ['show', `${base}:${guard}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1e8 }); } catch { was = null; }
    }
    const old = was === null ? null : splitMutants(was);
    if (!old) return { all: true, why: `${guard} is new or its base has no MUTANTS list` };
    if (old.rest !== head.rest) return { all: true, why: `${guard} changed outside its MUTANTS list (the harness)` };
    let before;
    try { before = new Map(parseMutants(old.block).map((m) => [m[0], JSON.stringify(m)])); } catch { return { all: true, why: 'the base MUTANTS list is unreadable' }; }
    for (const m of list) if (before.get(m[0]) !== JSON.stringify(m)) keep.set(m[0], before.has(m[0]) ? 'its definition changed' : 'a new mutant');
  }
  /* ANCHOR: the file the mutant patches. */
  for (const m of list) if (!keep.has(m[0]) && changed.includes(m[1])) keep.set(m[0], `${m[1]} changed`);
  return { all: false, keep: new Set(keep.keys()), why: keep };
}

/** The scope the gate handed this process (HR_MUTANT_SCOPE), or none. */
export function gateScope(env = process.env) {
  if (!env.HR_MUTANT_SCOPE) return { changed: null, base: null };
  try {
    const p = JSON.parse(readFileSync(env.HR_MUTANT_SCOPE, 'utf8'));
    return p && !p.full && Array.isArray(p.changed) ? { changed: p.changed, base: p.base || null } : { changed: null, base: null };
  } catch { return { changed: null, base: null }; }
}

// ── SHARDS, BALANCED BY TIME (2026-10-22) ──────────────────────────────────
// Run 39765799475 (release/v0.2.28): in-page-3, hunt-screen --mutate shard 1/3,
// was CANCELLED at its 46-min limit. The shards were round-robin by index, and a
// mutant costs 2 s (caught by the first rule) to 155 s (caught only after a full
// boot), so equal counts were never equal minutes. The plan is a longest-first
// greedy over the measured seconds (tests/<guard>.mutant-times.json); an
// unmeasured mutant costs the slowest measured one, so a new mutant is never
// under-booked. Deterministic: every CI job computes the same plan from the same list.

/** [{ names: string[], seconds: number }] × n — every name in exactly one shard. */
export function planShards(names, n, seconds = {}) {
  const known = Object.values(seconds).filter((s) => Number.isFinite(s) && s > 0);
  const fallback = known.length ? Math.max(...known) : 60;
  const est = (k) => (Number.isFinite(seconds[k]) && seconds[k] > 0 ? seconds[k] : fallback);
  const order = [...names].sort((a, b) => est(b) - est(a) || (a < b ? -1 : a > b ? 1 : 0));
  const shards = Array.from({ length: n }, () => ({ names: [], seconds: 0 }));
  for (const k of order) {
    let best = 0;
    for (let i = 1; i < n; i++) if (shards[i].seconds < shards[best].seconds) best = i;
    shards[best].names.push(k);
    shards[best].seconds += est(k);
  }
  return shards;
}

/** Problems with a plan: a mutant in no shard or in two, a name that is not a mutant, an empty shard. */
export function checkShards(names, shards) {
  const out = [];
  const seen = new Map();
  shards.forEach((s, i) => {
    if (!s.names.length) out.push(`shard ${i + 1}/${shards.length} selects no mutant`);
    for (const k of s.names) {
      if (seen.has(k)) out.push(`"${k}" runs in shard ${seen.get(k)} and shard ${i + 1}`);
      else seen.set(k, i + 1);
    }
  });
  const want = new Set(names);
  for (const k of want) if (!seen.has(k)) out.push(`"${k}" runs in no shard`);
  for (const k of seen.keys()) if (!want.has(k)) out.push(`"${k}" is planned but is not a mutant`);
  if (want.size !== names.length) out.push('two mutants share a name (a plan by name cannot tell them apart)');
  return out;
}
