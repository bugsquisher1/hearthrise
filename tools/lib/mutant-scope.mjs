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
//               this file) -> EVERY mutant. A guard imported for its harness is no
//               harness while the edit stays in its own rule functions (below).
//
// The list is the guard's `const MUTANTS = [ … ];` literal (an array of
// [name, file, from, to] entries), read from the guard's source at HEAD and at the
// diff's base. Anything that cannot be read — no scope from the gate (a nightly,
// a manual or a local run), no base, an unparsable list — is EVERY mutant: the
// scope only ever narrows a run the gate already decided is a push.
//
// The gate hands the scope over as HR_MUTANT_SCOPE: the path of its per-job plan,
// `{ base, changed }`.
//
// THE RULE EDIT (2026-11-01, lane a-ci-speed). Run 41339988105 spent 443 of its 979
// runner-minutes re-proving alpha-windows and hunt-screen whole because a lane had
// edited one rule in each, which is every release. A catch depends on the rules up to
// the one that catches it and on the shared harness, so a guard that opts in with a
//     // mutant-rule-functions: checks pure …
// header and a `/* mutant-rules-start */` line (above it, a rule function's helpers are
// harness) narrows an edit that stays inside those functions to: the mutants a changed
// rule catches (tests/<guard>.mutant-rules.json, name -> first catching rule, refreshed
// from a full run with `tools/mutant-gate.mjs --rules-from`), any mutant with no rule on
// record, and three canaries in case the edit cost the whole guard its bite. An edit to a
// function a `// mutant-runner-functions: main` header lists (the loop that plants and
// judges) changes no rule, and any bite it costs shows on the canaries. Anything it
// cannot classify is EVERY mutant: a changed helper, a removed function, a top-level
// statement, a changed line with no rule id near it.
//
// SERVER AND COMBAT (same lane). A guard with a mutant planted in the edge, a migration
// or src/core is a server guard: when the diff touches a server or combat file (those,
// or a data row combat reads) and the guard loads it, every mutant runs, the rule's
// plain reading. Guards with no scopedMutants call keep the plain reading always.
// ════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { touchedBy, guardSources, stripComments } from './guard-deps.mjs';

const START = 'const MUTANTS = [';
const CANARIES = 3;
/* The same shape as tests/_mutant-verdict.mjs ruleOf reads off a fail line. */
const RULE_ID = /\b[A-Z][A-Z0-9]*-[0-9][A-Za-z0-9]*\b|\b[A-Z][A-Z0-9]*-[A-Z][A-Z0-9]*\b/g;

// ── server and combat files ─────────────────────────────────────────────────
const IMPORT = /\bfrom\s+'([^'?]+)(?:\?[^']*)?'|\bimport\s+'([^'?]+)(?:\?[^']*)?'/g;

/** src/data/** files the one combat engine reads, followed through its imports. Throws when a root cannot be read. */
function combatData(root) {
  const seen = new Set();
  const out = new Set();
  const walk = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    let text;
    try { text = readFileSync(join(root, rel), 'utf8'); } catch (e) { if (rel.startsWith('src/core/combat-sim')) throw e; return; }
    if (rel.startsWith('src/data/')) out.add(rel);
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1] || m[2];
      if (spec.startsWith('.')) walk(posix.normalize(posix.join(posix.dirname(rel), spec)));
    }
  };
  walk('src/core/combat-sim.js');
  const hunt = join(root, 'src/core/hunt');
  for (const f of readdirSync(hunt)) if (statSync(join(hunt, f)).isFile()) walk(`src/core/hunt/${f}`);
  return out;
}

/** (file) => is it the server's or combat's. Unreadable engine = every file counts (fail safe). */
function serverOrCombat(root) {
  let data;
  try { data = combatData(root); } catch { return () => true; }
  return (f) => /^supabase\/(functions|migrations)\//.test(f) || f.startsWith('src/core/') || data.has(f);
}

// ── the rule edit ───────────────────────────────────────────────────────────
/** A source as top-level regions: name -> { kind, lines }. A region runs to the next top-level opener. */
function regionsOf(src) {
  const out = new Map();
  let cur = null;
  for (const line of src.split('\n')) {
    let name = null; let kind = null;
    const fn = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/.exec(line);
    const dc = /^(?:export\s+)?(?:const|let|var|class)\s+(\w+)/.exec(line);
    if (fn) { name = fn[1]; kind = 'function'; }
    else if (dc) { name = dc[1]; kind = 'declaration'; }
    else if (/^import\b/.test(line)) { name = 'import'; kind = 'import'; }
    else if (/^[^\s/*})\]]/.test(line)) { name = `statement: ${line}`; kind = 'statement'; }
    if (name) {
      cur = out.get(name) || { kind, lines: [] };
      out.set(name, cur);
    } else if (!cur) {
      cur = { kind: 'comment', lines: [] };
      out.set('(header)', cur);
    }
    cur.lines.push(line);
  }
  return out;
}

const idsIn = (line) => line.match(RULE_ID) || [];
/* The code alone: a comment cannot move a catch. */
const codeOf = (text) => stripComments(text).split('\n').filter((l) => l.trim()).join('\n');

/* The lines one side holds more often than the other, as indexes into that side. */
function extraLines(lines, other) {
  const left = new Map();
  for (const l of other) left.set(l, (left.get(l) || 0) + 1);
  const at = [];
  lines.forEach((l, i) => { const n = left.get(l) || 0; if (n) left.set(l, n - 1); else if (l.trim()) at.push(i); });
  return at;
}

/* The rule ids a changed line belongs to: its own, else the nearest named line above and below. */
function ruleIdsAt(lines, at) {
  const out = new Set();
  for (const i of at) {
    const own = idsIn(lines[i]);
    if (own.length) { for (const id of own) out.add(id); continue; }
    for (const step of [-1, 1]) {
      for (let j = i + step; j >= 0 && j < lines.length; j += step) {
        const ids = idsIn(lines[j]);
        if (ids.length) { for (const id of ids) out.add(id); break; }
      }
    }
  }
  return out;
}

/**
 * Classify an edit of a guard outside its MUTANTS list.
 * @returns {{ ok: true, rules: Set<string> } | { ok: false, why: string }}
 */
export function classifyRuleEdit(baseRest, headRest, optIn = headRest) {
  const header = /^\/\/ mutant-rule-functions:\s*(.+)$/m.exec(optIn);
  if (!header) return { ok: false, why: 'it has no mutant-rule-functions header' };
  const ruleFns = new Set(header[1].trim().split(/\s+/));
  const runnerFns = new Set((/^\/\/ mutant-runner-functions:\s*(.+)$/m.exec(optIn) || [null, ''])[1].trim().split(/\s+/));
  const was = regionsOf(baseRest); const now = regionsOf(headRest);
  const same = (x, y) => codeOf(x.join('\n')) === codeOf(y.join('\n'));
  const rules = new Set();
  for (const [name, r] of was) {
    if (!now.has(name) && !same(r.lines, [])) return { ok: false, why: `${name} was removed` };
  }
  for (const [name, r] of now) {
    const old = was.get(name);
    if (r.kind === 'import' || r.kind === 'comment') continue;
    if (!old) {
      /* New code cannot move a catch unless an edited rule calls it, and that edit is judged below. */
      if (r.kind === 'statement') return { ok: false, why: `a new top-level statement: ${name.slice(0, 80)}` };
      for (const l of r.lines) for (const id of idsIn(l)) rules.add(id);
      continue;
    }
    if (same(old.lines, r.lines) || runnerFns.has(name)) continue;
    if (!ruleFns.has(name)) return { ok: false, why: `${name} is not a rule function` };
    const startOf = (lines) => lines.findIndex((l) => l.trim() === '/* mutant-rules-start */');
    const s0 = startOf(old.lines); const s1 = startOf(r.lines);
    if ((s0 < 0) !== (s1 < 0)) return { ok: false, why: `${name}'s mutant-rules-start line moved` };
    if (s0 >= 0 && !same(old.lines.slice(0, s0), r.lines.slice(0, s1))) return { ok: false, why: `${name}'s helpers changed` };
    const oldBody = old.lines.slice(Math.max(s0, 0)); const newBody = r.lines.slice(Math.max(s1, 0));
    const named = new Set([...ruleIdsAt(newBody, extraLines(newBody, oldBody)), ...ruleIdsAt(oldBody, extraLines(oldBody, newBody))]);
    if (!named.size) return { ok: false, why: `an edit in ${name} names no rule` };
    for (const id of named) rules.add(id);
  }
  return { ok: true, rules };
}

/* A GUARD IMPORTED FOR ITS HARNESS (2026-11-04). perf-budget and hunt-scene-live import hunt-live's HARNESS, so a two-line edit of a
   rule inside hunt-live ran all of perf-budget's mutants: 90 of v0.2.86's runner-minutes, three jobs, 30 min each. A rule
   function is not what an importer reads: a guard that lists its rule functions (mutant-rule-functions) and changed only
   those is no harness to the guards that import it. Anything else it changed, or a side that cannot be read, still is. */
function ruleEditOnly(file, { root, base, tip, helperText }) {
  if (!/^tests\/[^_][^/]*\.mjs$/.test(file)) return false;
  try {
    const show = (rev) => execFileSync('git', ['show', `${rev}:${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1e8 });
    const sides = helperText ? helperText(file) : { head: tip ? show(tip) : readFileSync(join(root, file), 'utf8'), base: base ? show(base) : null };
    const head = splitMutants(sides.head); const was = sides.base && splitMutants(sides.base);
    if (!head || !was) return false;
    const edit = classifyRuleEdit(was.rest, head.rest, tip && !helperText ? readFileSync(join(root, file), 'utf8') : head.rest);
    /* Which of ITS rules moved is its own mutants' question; the importer asks only that it stayed in a rule function. */
    return edit.ok || /names no rule$/.test(edit.why);
  } catch { return false; }
}

/** tests/<guard>.mutant-rules.json as name -> rule; empty when there is none (so every mutant runs). */
function recordedRules(root, guard) {
  try { return JSON.parse(readFileSync(join(root, guard.replace(/\.mjs$/, '.mutant-rules.json')), 'utf8')); } catch { return {}; }
}

/* A rule edit's canaries: the same few in every shard, a different few for a different edit. */
function canaries(names, seed) {
  const score = (n) => createHash('sha256').update(`${seed}\n${n}`).digest('hex');
  return [...names].sort((a, b) => (score(a) < score(b) ? -1 : 1)).slice(0, CANARIES);
}

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
 * @param {string|null} [o.tip]     the diff's other end when it is not the checkout (a rehearsal)
 * @param {string} [o.headSource]   injectable for the selftest
 * @param {string|null} [o.baseSource]
 * @param {Map<string,string>} [o.sources]  tests/tools sources (guard-deps), injectable
 * @param {Record<string,string[]>} [o.companion]  name -> further files a mutant patches
 * @param {Record<string,string>} [o.rules]  name -> first catching rule, injectable
 * @param {(f: string) => boolean} [o.strict]  server/combat files, injectable
 * @param {(f: string) => { head: string, base: string|null }} [o.helperText]  a changed guard's two sides, injectable
 * @returns {{ all: true, why: string } | { all: false, keep: Set<string>, why: Map<string,string> }}
 */
export function scopeMutants({ guard, root, changed, base = null, tip = null, headSource, baseSource, sources, companion = {}, rules, strict, helperText }) {
  if (!Array.isArray(changed)) return { all: true, why: 'no gate scope — the full sweep' };
  let headText = headSource;
  if (headText === undefined && tip) {
    try { headText = execFileSync('git', ['show', `${tip}:${guard}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1e8 }); } catch { return { all: true, why: `${guard} is not readable at ${tip}` }; }
  }
  const head = splitMutants(headText ?? readFileSync(join(root, guard), 'utf8'));
  if (!head) return { all: true, why: `${guard} has no \`${START}\` list` };
  let list;
  try { list = parseMutants(head.block); } catch (e) { return { all: true, why: `MUTANTS unreadable (${e.message})` }; }

  /* HARNESS (1): a tests/ or tools/ helper or fixture the guard's own code — not its mutant
     strings, which name the files they patch — loads, directly or through an import. */
  const src = new Map(sources || guardSources(root));
  src.set(guard, stripComments(head.rest));
  const helpers = changed.filter((f) => f !== guard && /^(tests|tools)\//.test(f) && !ruleEditOnly(f, { root, base, tip, helperText }));
  const viaHelper = touchedBy(helpers, src).get(guard);
  if (viaHelper) return { all: true, why: `the harness moved: ${viaHelper}` };

  /* A server guard (a mutant planted in the edge, a migration or src/core) whose server or
     combat file moved: the rule's plain reading, every mutant. A client guard with a mutant
     in a data row (alpha-windows' Shop list) stays scoped: that mutant runs when its row moves. */
  const isStrict = strict || serverOrCombat(root);
  if (list.some((m) => [m[1], ...(companion[m[0]] || [])].some((f) => isStrict(f) && !f.startsWith('src/data/')))) {
    const viaServer = touchedBy(changed.filter((f) => isStrict(f)), src).get(guard);
    if (viaServer) return { all: true, why: `a server guard, and its server or combat file moved: ${viaServer}` };
  }

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
    if (codeOf(old.rest) !== codeOf(head.rest)) {
      /* The checkout opts in: a rehearsal's tip predates the header. */
      const edit = classifyRuleEdit(old.rest, head.rest, tip ? readFileSync(join(root, guard), 'utf8') : head.rest);
      if (!edit.ok) return { all: true, why: `${guard} changed outside its MUTANTS list (the harness): ${edit.why}` };
      const caughtBy = rules || recordedRules(root, guard);
      for (const m of list) {
        const rule = caughtBy[m[0]];
        if (!rule) keep.set(m[0], 'no rule on record');
        else if (edit.rules.has(rule)) keep.set(m[0], `its rule ${rule} changed`);
      }
      const seed = createHash('sha256').update(head.rest).digest('hex');
      for (const n of canaries(list.map((m) => m[0]), seed)) if (!keep.has(n)) keep.set(n, 'a canary for the rule edit');
    }
    let before;
    try { before = new Map(parseMutants(old.block).map((m) => [m[0], JSON.stringify(m)])); } catch { return { all: true, why: 'the base MUTANTS list is unreadable' }; }
    for (const m of list) if (before.get(m[0]) !== JSON.stringify(m)) keep.set(m[0], before.has(m[0]) ? 'its definition changed' : 'a new mutant');
  }
  /* ANCHOR: the file the mutant patches. */
  for (const m of list) {
    if (keep.has(m[0])) continue;
    const hit = [m[1], ...(companion[m[0]] || [])].find((f) => changed.includes(f));
    if (hit) keep.set(m[0], `${hit} changed`);
  }
  return { all: false, keep: new Set(keep.keys()), why: keep };
}

/** The scope the gate handed this process (HR_MUTANT_SCOPE), or none. */
export function gateScope(env = process.env) {
  if (!env.HR_MUTANT_SCOPE) return { changed: null, base: null };
  try {
    const p = JSON.parse(readFileSync(env.HR_MUTANT_SCOPE, 'utf8'));
    return p && !p.full && Array.isArray(p.changed) ? { changed: p.changed, base: p.base || null, tip: p.tip || null } : { changed: null, base: null };
  } catch { return { changed: null, base: null }; }
}

/**
 * The part of a guard's list a gated --mutate run proves, said out loud. Every mutant
 * without a gate scope (a nightly, a manual or a local run). An empty answer means the
 * guard has nothing to prove on this diff: its caller exits 0 before its clean control.
 */
export function scopedMutants(guard, list, { companion = {}, tag = '', env = process.env } = {}) {
  const scope = scopeMutants({ guard, root: fileURLToPath(new URL('../..', import.meta.url)), ...gateScope(env), companion });
  if (scope.all) {
    if (env.HR_MUTANT_SCOPE) console.log(`  scope: every mutant — ${scope.why}`);
    return list;
  }
  const mine = list.filter((m) => scope.keep.has(m[0]));
  console.log(`  scope: ${mine.length} of ${list.length} mutant(s)${tag} touched by this diff`);
  for (const m of mine) console.log(`    ${m[0]} — ${scope.why.get(m[0])}`);
  if (!mine.length) console.log(`${guard} --mutate${tag}: no mutant here is touched by this diff (the nightly sweep runs them)`);
  return mine;
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
