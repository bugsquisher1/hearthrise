#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/guard-hygiene.mjs — THE GUARDS ARE REACHABLE, AND THEIR PROOFS ARE REAL
//
//   node tests/guard-hygiene.mjs             # the guard
//   node tests/guard-hygiene.mjs --list      # the mutation catalogue
//   node tests/guard-hygiene.mjs --selftest  # every mutation must be CAUGHT
//   node tests/guard-hygiene.mjs --json
//
// mutant-anchors: none — every --selftest mutation transforms an in-memory copy of the tree (readTree), never a file
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
// Two failures, both silent, both measured in this repo on 2026-09-06.
//
// R1 — THE ORPHAN. tests/worker-accrual.mjs carried, in its own header, the
// sentence "also invoked by run-smoke.mjs". Nothing invoked it. Not CI, not
// run-smoke, not another guard. Thirteen assertions (W1-W13) about the hired-
// crew accrual rate — an economy faucet — had been collected by nobody for
// months, while the file sat in tests/ looking exactly like coverage. A test
// nobody runs is worse than no test: it is a test somebody will cite.
//
// The audit that found it first reported THIRTY-SEVEN files in that state. That
// number was wrong, and the way it was wrong is the reason this rule lives in a
// committed guard instead of in a one-off script: the script matched static
// imports and missed run-smoke.mjs's `await import('./x.mjs')` calls, so 23
// perfectly well-covered guards were accused. The real count was 12. Hand-rolled
// reachability answers are wrong in both directions; this one is executable,
// mutation-proven, and runs on every push.
//
// R2 — THE VACUOUS PROOF. CLAUDE.md §4 requires every standing guard to carry a
// --selftest/--mutate mutation proof, and .github/workflows/smoke.yml duly
// passes --selftest to many steps. Node does not care about unknown flags. A
// file that ignores --selftest runs its ORDINARY body, passes, and prints a
// green tick under a step named "…— mutation proof". The log is indistinguish-
// able from a real one. So the flag must be shown to CHANGE THE EXIT PATH.
//
// R3 — THE PROOF WITH NO FLOOR (measured 2026-09-12). A security review planted
// `where kind = NOSUCHCOLUMN_XYZ` in tests/dungeon-cooldown.mjs's own SQL — a
// defect that makes the guard incapable of measuring anything — and the
// --selftest printed "All 6 mutations caught… non-vacuous", exit 0, because the
// driver ran no CLEAN arm and scored every throw as "the guard went red". The
// census found 23 more steps registered with ONLY a proof flag: nothing in CI
// ever ran their plain body, so a guard that was broken at rest stayed green
// forever. tests/snapshot-allowlist-guard.mjs is the proof that the plain run
// carries information the selftest does not — its plain run is RED on today's
// tree (838 findings) with the selftest green beside it.
//
// ── THE THREE RULES ─────────────────────────────────────────────────────
//   REACHABILITY  every tests/*.mjs is (a) named in a run: line in smoke.yml,
//                 (b) imported or spawned by tests/run-smoke.mjs, (c) imported
//                 or spawned by another guard, or (d) listed in
//                 tests/guards-unregistered.json with a non-empty reason.
//   NON-VACUITY   every smoke.yml step whose command passes --selftest (or
//                 --mutate / --live-selftest / --baseline-selftest) resolves to
//                 a file that BRANCHES on that flag.
//   A FLOOR       every guard registered with a proof flag ALSO has its plain
//                 run registered — in smoke.yml, or plainly by run-smoke.mjs —
//                 or is listed in tests/guards-unregistered.json's
//                 `proof_baseline` section with a written reason. A mutation
//                 proof answers "can this guard go red"; only the plain run
//                 answers "is it green when it should be", and a proof harness
//                 that never sees green cannot tell a caught defect from its own
//                 corpse.
//
// Plus two hygiene rules the allowlist needs to stay honest, because an
// allowlist that is never pruned is just a second place to hide:
//   NO-GHOSTS     the allowlist may not name a file that does not exist.
//   NO-REDUNDANT  the allowlist may not name a file that IS reachable — that
//                 entry is stale and hides the fact that the debt was paid.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────
// It does not judge whether a guard is GOOD, whether its assertions are strong,
// or whether its mutations are meaningful. It cannot: those are readings, not
// measurements. It answers the two questions that are decidable from the tree —
// is it wired up, and does the flag do anything — and it is worth exactly that.
// A guard can satisfy every rule here and still be worthless; what it can no
// longer be is INVISIBLY worthless.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'smoke.yml');
const ALLOWLIST = join(HERE, 'guards-unregistered.json');

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');

/* The runners themselves are not guards — they are the things that run guards.
   run-ci-local.mjs derives its steps from smoke.yml, so it is registered by
   construction; run-smoke.mjs IS the in-page suite step. */
const RUNNERS = new Set(['run-smoke.mjs', 'run-ci-local.mjs', 'guard-hygiene.mjs']);

/* The flags that CLAIM a mutation proof. --live-selftest and --baseline-selftest
   are the two variants already in the workflow; listing them explicitly (rather
   than matching /selftest/) keeps a typo'd flag from silently counting. */
const PROOF_FLAGS = ['--selftest', '--mutate', '--live-selftest', '--baseline-selftest'];

// ── READING THE TREE ─────────────────────────────────────────────────────

function guardFiles(dir = HERE) {
  return readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort();
}

/**
 * Every `run:` command in the workflow, as raw strings.
 *
 * A COMMENT LINE IS NOT A COMMAND (2026-11-14). A `# node tests/x.mjs` line inside a `run: |` block is
 * shell comment, and it used to register x.mjs here while tests/run-ci-local.mjs's parser (the one CI and
 * tests/ci-shape.mjs read) drops it: a guard commented out of its step stayed "registered" with nothing
 * running it. Same class as the bare-string chain (M13): a mention is not a run. M14 proves it.
 */
function workflowCommands(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = /^\s*run:\s*(.+?)\s*$/.exec(line);
    if (m && !/^[|>][-+]?$/.test(m[1])) out.push(m[1]);
  }
  // Block scalars (`run: |`) hold their commands on following lines.
  const block = /^\s*run:\s*[|>][-+]?\s*$/;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!block.test(lines[i])) continue;
    const indent = (/^(\s*)/.exec(lines[i + 1] || '') || ['', ''])[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === '') continue;
      if ((/^(\s*)/.exec(l))[1].length < indent) break;
      if (l.trim().startsWith('#')) continue;
      out.push(l.trim());
    }
  }
  return out;
}

/**
 * A workflow that RUNS ON ITS OWN: its top-level `on:` holds `push:` or `schedule:` (nightly-loop.yml, pages.yml).
 * A workflow_dispatch-only one (perf-measure.yml) runs when somebody remembers, which is what "not in CI" means.
 */
export function runsOnItsOwn(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const at = lines.findIndex((l) => /^on:\s*$/.test(l));
  if (at < 0) return /^on:\s*\[?[^\n]*\b(push|schedule)\b/m.test(text);
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l)) break;                       // the next top-level key
    if (/^\s{2}(push|schedule):/.test(l)) return true;
  }
  return false;
}

/**
 * Every repo script a command RUNS with a proof flag: `node <tests|tools>/…/x.mjs … --selftest`. The mutant gate's
 * wrapper (`node tools/mutant-gate.mjs node tests/x.mjs --mutate`) is two invocations, and the flag belongs to the
 * second: each `node <script>` takes the arguments up to the next `node`.
 */
export function proofRunsIn(cmd) {
  const out = [];
  for (const seg of cmd.split(/&&|\|\||;|\|/)) {
    for (const m of seg.matchAll(/\bnode\s+((?:tests|tools)\/[A-Za-z0-9._/-]+\.mjs)((?:\s+(?!node\b)[^\s]+)*)/g)) {
      if (PROOF_FLAGS.some((f) => new RegExp('(?:^|\\s)' + f.replace(/-/g, '\\-') + '(?![\\w-])').test(m[2]))) out.push(m[1]);
    }
  }
  return out;
}

/** Which tests/*.mjs a command names, and with which proof flags. */
function namedIn(cmd) {
  const files = [...cmd.matchAll(/tests\/([A-Za-z0-9._-]+\.mjs)/g)].map((m) => m[1]);
  const flags = PROOF_FLAGS.filter((f) => new RegExp(f.replace(/-/g, '\\-') + '(?![\\w-])').test(cmd));
  return { files, flags };
}

/**
 * Files referenced in an EXECUTABLE position by another file's source.
 *
 * A bare 'tests/x.mjs' string is NOT an executable position (audit 2026-11-13): tests/mutant-control.mjs
 * listed 'tests/party-hunt-view.mjs' in a data table, which made that guard "chained" for weeks while the
 * only thing that ran it was the control (every arm planted with NOTHING), never its plain body, and its
 * function had been dropped by 2026-10-27-core-schema.sql. Only run-smoke.mjs, the in-page suite's own
 * runner, still counts that form (`bareLiteral`), because plainlyInRunSmoke judges its spawns line by line.
 */
function references(src, { bareLiteral = false } = {}) {
  const out = new Set();
  // static / dynamic import of a sibling guard
  for (const m of src.matchAll(/from\s+'\.\/([A-Za-z0-9._-]+\.mjs)'/g)) out.add(m[1]);
  for (const m of src.matchAll(/import\s*\(\s*'\.\/([A-Za-z0-9._-]+\.mjs)'\s*\)/g)) out.add(m[1]);
  // spawned: join(ROOT, 'tests', 'x.mjs') — the shape run-smoke uses
  for (const m of src.matchAll(/'tests'\s*,\s*'([A-Za-z0-9._-]+\.mjs)'/g)) out.add(m[1]);
  if (bareLiteral) for (const m of src.matchAll(/'tests\/([A-Za-z0-9._-]+\.mjs)'/g)) out.add(m[1]);
  return out;
}

/**
 * Is `f` invoked by run-smoke.mjs in its PLAIN body — no proof flag on the call?
 * run-smoke mostly imports a guard's exported entry point (`import { runAll } from
 * './icon-boot-order.mjs'`), which is by definition the plain body; what must not
 * count is a spawn that passes --selftest, because that is the same one-sided
 * proof the rule is about. So: an import counts, and a spawn counts only when no
 * proof flag appears within three lines of the file's name.
 */
function plainlyInRunSmoke(runSmokeSrc, f) {
  const esc = f.replace(/[.]/g, '\\.');
  if (new RegExp(`from\\s+'\\./${esc}'`).test(runSmokeSrc)) return true;
  if (new RegExp(`import\\(\\s*'\\./${esc}'\\s*\\)`).test(runSmokeSrc)) return true;
  const lines = runSmokeSrc.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!new RegExp(`'tests'\\s*,\\s*'${esc}'|'tests/${esc}'`).test(lines[i])) continue;
    const window = lines.slice(i, i + 3).join('\n');
    if (!PROOF_FLAGS.some((fl) => window.includes(fl))) return true;
  }
  return false;
}

/**
 * Does `src` BRANCH on `flag`? Not "does it mention it" — a header comment
 * documenting `--selftest` is exactly the vacuous case this rule exists for,
 * and every one of these files documents its flags in a header.
 *
 * So: strip comments and strings-that-are-clearly-prose first, then require the
 * flag to appear inside an argv test.
 */
export function implementsFlag(src, flag) {
  // COMMENT STRIPPING, THE CONSERVATIVE WAY.
  // The obvious approach — a lazy regex from block-open to block-close — is
  // wrong here, and produced two false accusations on the first run of this
  // file (bounty-hunter-xp.mjs and live-hash-drift.mjs, both of which DO
  // implement their flags). These guards embed SQL and regex literals that
  // contain a block-comment opener, so a lazy match swallows every real line
  // between that incidental opener and the next closer — in live-hash-drift
  // that included the `argv.includes` line itself.
  //
  // A guard that accuses a healthy file is as useless as one that misses a
  // sick one, so drop only LINES that are unambiguously comment lines. Every
  // header in this tree is written that way, which is the case that matters:
  // documenting a flag must never count as implementing it.
  //
  // (This function's own first draft was also a block comment containing a
  //  closer, which ended it early and would not parse. Kept as line comments.)
  const code = src.split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  const f = flag.replace(/-/g, '\\-');
  const patterns = [
    // argv.includes('--selftest') — under any variable name (`arg`, `args`, …)
    new RegExp(`\\.includes\\(\\s*['"\`]${f}['"\`]`),
    // argv.find(a => a.startsWith('--mutate=')) — the parameterised form
    new RegExp(`startsWith\\(\\s*['"\`]${f}`),
    // a === '--selftest'
    new RegExp(`===\\s*['"\`]${f}['"\`]`),
    new RegExp(`['"\`]${f}['"\`]\\s*===`),
    // switch (a) { case '--selftest': …
    new RegExp(`case\\s+['"\`]${f}['"\`]\\s*:`),
    // indexOf('--selftest') !== -1
    new RegExp(`indexOf\\(\\s*['"\`]${f}['"\`]`),
    /* The `has('selftest')` idiom: activity-intent.mjs and claim-intent.mjs
       both define `const has = (n) => argv.includes(\`--\${n}\`)` and then
       branch on the BARE name. Matching only the dashed literal called both of
       them vacuous on the first run of this file — they are not. Require the
       helper to be defined over argv in the same file, so a stray `has('x')`
       from some unrelated Map cannot satisfy the rule. */
    ...(/const\s+has\s*=\s*\(\s*\w+\s*\)\s*=>\s*\w*argv\w*\.includes/.test(code)
      ? [new RegExp(`\\bhas\\(\\s*['"\`]${flag.replace(/^--/, '')}['"\`]\\s*\\)`)]
      : []),
  ];
  return patterns.some((p) => p.test(code));
}

// ── THE VERDICT, as a pure function of the tree ──────────────────────────
// Everything it reads is an argument, so --selftest can hand it a MUTATED tree
// and require this exact code — the code CI runs — to go red.
/** First line number (1-based) of a hand-rolled main-module compare, else 0. Comments are skipped. */
export function handRolledIsMain(src) {
  const lines = src.split('\n');
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (inBlock) {
      if (!l.includes('*/')) continue;
      inBlock = false; l = l.slice(l.indexOf('*/') + 2);
    }
    l = l.replace(/\/\*.*?\*\//g, '');
    if (l.includes('/*')) { inBlock = true; l = l.slice(0, l.indexOf('/*')); }
    l = l.replace(/(^|\s)\/\/.*$/, '$1');   // not the // of file://
    if (!/process\.argv(?:\[1\]|\.at\(1\))/.test(l)) continue;
    const win = [lines[i - 1], l, lines[i + 1]].join(' ');
    if (/import\.meta\.url|pathToFileURL|fileURLToPath|endsWith|file:\/\//.test(win)) return i + 1;
  }
  return 0;
}

export function verdict({ files, workflowText, runSmokeSrc, sources, allowlist, toolSources, otherWorkflows, nestedTestSources }) {
  const problems = [];
  /* smoke.yml, plus every other workflow that runs on its own (nightly-loop.yml: Tyler's once-a-day core loop) */
  const cmds = [workflowText, ...Object.values(otherWorkflows || {}).filter(runsOnItsOwn)].flatMap(workflowCommands);

  // Who is reachable, and how?
  const registered = new Map();   // file -> [flags seen on its run: lines]
  for (const cmd of cmds) {
    const { files: named, flags } = namedIn(cmd);
    for (const f of named) {
      if (!registered.has(f)) registered.set(f, []);
      registered.get(f).push({ cmd, flags });
    }
  }

  const fromRunSmoke = references(runSmokeSrc, { bareLiteral: true });
  /* A CHAIN STARTS AT SOMETHING THAT RUNS (2026-11-14). A file imported or spawned only by a guard nothing runs (one
     on the allowlist, run by hand) is run by nothing either; counting it "chained" was the bare-string hole (M13) one
     level down. So the chain is walked from the roots, registered files, run-smoke's and the runners, to a fixpoint. M15. */
  const refsOf = new Map();
  for (const [name, src] of Object.entries(sources)) {
    if (name === 'run-smoke.mjs') continue;
    /* THIS FILE'S OWN mutation catalogue names other guards in string literals
       ("run: node tests/gold-intents.mjs"), and a meta-guard that made every
       file it mentions look reachable would switch off the rule it exists to
       enforce. Skip self. */
    if (name === 'guard-hygiene.mjs') continue;
    refsOf.set(name, [...references(src)].filter((ref) => ref !== name));
  }
  const chained = new Map();      // file -> the reachable guard that chains it
  {
    const reached = new Set([...registered.keys(), ...fromRunSmoke, ...RUNNERS]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [name, refs] of refsOf) {
        if (!reached.has(name)) continue;
        for (const ref of refs) {
          if (reached.has(ref)) continue;
          reached.add(ref); chained.set(ref, name); grew = true;
        }
      }
    }
  }

  const allowed = allowlist.guards || {};

  // ── RULE 1: REACHABILITY ───────────────────────────────────────────────
  for (const f of files) {
    if (RUNNERS.has(f)) continue;
    const how = registered.has(f) ? 'smoke.yml'
      : fromRunSmoke.has(f) ? 'run-smoke.mjs'
      : chained.has(f) ? `chained from ${chained.get(f)}`
      : null;
    if (how) continue;

    const entry = allowed[f];
    if (!entry) {
      problems.push(`ORPHAN: tests/${f} is run by nothing — not smoke.yml, not run-smoke.mjs, not another `
        + 'guard — and is not listed in tests/guards-unregistered.json. A guard nobody runs is not coverage, '
        + 'it is a file that looks like coverage (tests/worker-accrual.mjs sat like this for months, with a '
        + 'header claiming otherwise). Register it, delete it, or add it to the allowlist WITH A REASON.');
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 40) {
      problems.push(`UNREASONED: tests/${f} is on the allowlist with no real reason ("${String(entry.reason).slice(0, 40)}"). `
        + 'The allowlist is the place the debt is written down; an entry with no argument in it is just a '
        + 'quieter orphan.');
    }
  }

  // ── RULE 2: NON-VACUITY ────────────────────────────────────────────────
  for (const [f, uses] of registered) {
    for (const { cmd, flags } of uses) {
      if (!flags.length) continue;
      const src = sources[f];
      if (src === undefined) {
        problems.push(`MISSING: smoke.yml runs \`${cmd}\` but tests/${f} does not exist.`);
        continue;
      }
      for (const flag of flags) {
        if (!implementsFlag(src, flag)) {
          problems.push(`VACUOUS PROOF: smoke.yml runs \`${cmd}\`, but tests/${f} never branches on ${flag}. `
            + 'Node ignores unknown flags, so that step runs the ORDINARY body, passes, and prints a green '
            + 'tick under a step name that claims a mutation proof. Implement the flag or stop passing it — '
            + 'a proof that cannot fail is worse than no proof, because it is cited.');
        }
      }
    }
  }

  // ── RULE 5: A PROOF NEEDS A FLOOR ──────────────────────────────────────
  // A --selftest step answers "can this guard be made red". The plain run is the
  // only thing that answers "is it green when nothing is wrong" — and the two
  // compound: a driver that scores a throw as a catch (the shape every bespoke
  // driver in this tree had on 2026-09-12) turns "the guard is broken" into "all
  // mutations caught", and with no plain run registered there is nothing left in
  // CI to notice. So the clean body must run in CI too.
  const baselineAllowed = allowlist.proof_baseline || {};
  for (const [f, uses] of registered) {
    if (!uses.some((u) => u.flags.length)) continue;             // no proof step here
    if (uses.some((u) => !u.flags.length)) continue;             // plain run registered beside it
    if (plainlyInRunSmoke(runSmokeSrc, f)) continue;             // its clean body runs in step 6
    const entry = baselineAllowed[f];
    if (!entry) {
      problems.push(`PROOF WITH NO FLOOR: smoke.yml runs tests/${f} ONLY with a mutation flag — its plain `
        + 'body never runs in CI. A mutation proof cannot distinguish "the guard caught the defect" from '
        + '"the guard is broken and everything throws" (measured 2026-09-12: a planted bad column name in a '
        + 'guard\'s own SQL printed "All 6 mutations caught", exit 0, while the plain run was red). Register '
        + `\`node tests/${f}\` beside the proof step, or add it to the proof_baseline section of `
        + 'tests/guards-unregistered.json with the reason its plain run cannot gate.');
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 40) {
      problems.push(`UNREASONED FLOOR EXEMPTION: tests/${f} is exempt from the plain-run rule with no real `
        + `reason ("${String(entry.reason).slice(0, 40)}"). Say why its plain body cannot gate in CI, or `
        + 'register it.');
    }
  }

  // ── RULE 6: ONE isMain, NEVER HAND-ROLLED (ISMAIN-1) ───────────────────
  // import.meta.url is a file:// URL; process.argv[1] is a backslash path on Windows. A hand-rolled
  // compare is false there, so the guard exits 0 having checked nothing (40+ files, 2026-10-17).
  // On Linux CI it DOES run, which is exactly why nobody saw it.
  for (const [name, src] of Object.entries({ ...(toolSources || {}), ...sources })) {
    // guard-hygiene.mjs itself carries the planted examples in its mutation catalogue
    if (name === '_is-main.mjs' || name === 'guard-hygiene.mjs') continue;
    const line = handRolledIsMain(src);
    if (line) {
      problems.push(`HAND-ROLLED isMain: ${name} line ${line} compares the entry path to the module location by hand. `
        + 'Use isMain(import.meta.url) from tests/_is-main.mjs; the hand-rolled forms are false on Windows.');
    }
  }

  // ── RULE 3 + 4: THE ALLOWLIST STAYS HONEST ─────────────────────────────
  for (const f of Object.keys(allowed)) {
    if (f.startsWith('$')) continue;   // $family:* notes are prose, by design
    if (!files.includes(f)) {
      problems.push(`GHOST: tests/guards-unregistered.json names tests/${f}, which does not exist. Delete the `
        + 'entry — a list of files that are not there teaches nothing and hides the ones that are.');
      continue;
    }
    const reachable = registered.has(f) || fromRunSmoke.has(f) || chained.has(f);
    if (reachable && allowed[f].disposition !== 'being-registered') {
      problems.push(`STALE ALLOWLIST ENTRY: tests/${f} IS reachable now, but is still listed as unregistered. `
        + 'Remove the entry so the list keeps meaning what it says — the debt was paid and the ledger should '
        + 'show it.');
    }
  }

  // ── RULE 7: EVERY PROOF ARM RUNS IN CI ─────────────────────────────────
  // RULES 2 and 5 judge the proof steps that EXIST. Nothing judged the proofs that were never registered: the
  // 2026-11-13 audit found ~29 guards whose --selftest/--mutate no workflow ran (lane/a-audit-guards wired 20), and
  // two of the rest had rotted unseen: tools/balance-sim/yard-table.mjs --selftest threw on an anchor the designer's
  // dial moved that day, and tools/balance-lab/parity.mjs had been red since 2026-11-08. A proof nobody runs is a
  // claim. So every tests/** and tools/** file that BRANCHES on --selftest or --mutate is run with a proof flag by a
  // workflow that runs on its own, or is named in proof_unrun with the reason it cannot run there.
  const unrunAllowed = allowlist.proof_unrun || {};
  const proofCapable = proofCapableFiles({ sources, toolSources, nestedTestSources });
  const proofRun = new Set(cmds.flatMap(proofRunsIn));
  for (const p of proofCapable) {
    if (proofRun.has(p)) continue;
    const entry = unrunAllowed[p];
    if (!entry) {
      problems.push(`PROOF NEVER RUN: ${p} branches on --selftest/--mutate, but no workflow that runs on its own (push or `
        + 'schedule) runs it with that flag, so it rots where nobody looks. Register `node tools/mutant-gate.mjs node ' + p
        + ' --selftest|--mutate` in a smoke.yml job, or name it in tests/guards-unregistered.json proof_unrun with the reason '
        + 'it cannot run there.');
      continue;
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 40) {
      problems.push(`UNREASONED PROOF EXEMPTION: ${p} is in proof_unrun with no real reason ("${String(entry.reason).slice(0, 40)}").`);
    }
  }
  for (const p of Object.keys(unrunAllowed)) {
    if (p.startsWith('$')) continue;
    if (!proofCapable.includes(p)) {
      problems.push(`GHOST: tests/guards-unregistered.json proof_unrun names ${p}, which does not exist or no longer branches on `
        + '--selftest/--mutate. Delete the entry.');
    } else if (proofRun.has(p)) {
      problems.push(`STALE PROOF EXEMPTION: ${p} is run with a proof flag in CI now, but proof_unrun still lists it. Remove `
        + 'the entry so the list keeps meaning what it says.');
    }
  }

  const stats = {
    guards: files.length - [...RUNNERS].filter((r) => files.includes(r)).length,
    registered: registered.size,
    via_run_smoke: fromRunSmoke.size,
    chained: chained.size,
    allowlisted: Object.keys(allowed).filter((k) => !k.startsWith('$')).length,
    proof_steps: [...registered.values()].flat().filter((u) => u.flags.length).length,
    proof_capable: proofCapable.length,
    proof_unrun: proofCapable.filter((p) => !proofRun.has(p)).length,
  };
  return { problems, stats };
}

/** Every tests/** and tools/** file that branches on --selftest or --mutate, as a repo-relative path. */
export function proofCapableFiles({ sources, toolSources, nestedTestSources }) {
  const all = {
    ...Object.fromEntries(Object.entries(sources || {}).map(([f, s]) => ['tests/' + f, s])),
    ...(nestedTestSources || {}),
    ...(toolSources || {}),
  };
  return Object.keys(all).filter((p) => implementsFlag(all[p], '--selftest') || implementsFlag(all[p], '--mutate')).sort();
}

/** The proof-capable files no workflow runs with a proof flag (tools/guard-anchors.mjs --unregistered prints these). */
export function unrunProofs(tree = readTree()) {
  const cmds = [tree.workflowText, ...Object.values(tree.otherWorkflows || {}).filter(runsOnItsOwn)].flatMap(workflowCommands);
  const run = new Set(cmds.flatMap(proofRunsIn));
  const exempt = (tree.allowlist && tree.allowlist.proof_unrun) || {};
  return proofCapableFiles(tree).filter((p) => !run.has(p)).map((p) => ({ path: p, exempt: exempt[p] ? exempt[p].reason : null }));
}

// ── Reading the real tree ────────────────────────────────────────────────
export function readTree() {
  const files = guardFiles();
  const sources = {};
  for (const f of files) sources[f] = readFileSync(join(HERE, f), 'utf8');
  const walk = (dir, into, skipTop, depth = 0) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(join(dir, e.name), into, skipTop, depth + 1); }
      else if (e.name.endsWith('.mjs') && !(skipTop && depth === 0)) {
        into[relative(ROOT, join(dir, e.name)).replace(/\\/g, '/')] = readFileSync(join(dir, e.name), 'utf8');
      }
    }
  };
  const toolSources = {};
  walk(join(ROOT, 'tools'), toolSources, false);
  /* tests/<sub>/**.mjs (tests/hunt-core/…): RULE 7 judges their proofs too; the top level is `sources` */
  const nestedTestSources = {};
  walk(HERE, nestedTestSources, true);
  const wfDir = dirname(WORKFLOW);
  const otherWorkflows = {};
  for (const f of readdirSync(wfDir)) {
    if (/\.ya?ml$/.test(f) && join(wfDir, f) !== WORKFLOW) otherWorkflows[f] = readFileSync(join(wfDir, f), 'utf8');
  }
  return {
    toolSources,
    nestedTestSources,
    otherWorkflows,
    files,
    workflowText: readFileSync(WORKFLOW, 'utf8'),
    runSmokeSrc: sources['run-smoke.mjs'] || '',
    sources,
    allowlist: JSON.parse(readFileSync(ALLOWLIST, 'utf8')),
  };
}

// ════════════════════════════════════════════════════════════════════════
// --selftest — THE MUTATION PROOF
//
// A meta-guard about vacuous proofs that could not itself go red would be the
// joke it exists to prevent. Each mutation below is a state this repo has
// ACTUALLY been in (M1, M2, M4 were all measured on 2026-09-06), applied to the
// real tree, and graded by the SAME verdict() the plain run calls.
// ════════════════════════════════════════════════════════════════════════
/* THE PLANTED GUARD (2026-11-13, run 43511513009). M3, M6 and M8-M10 used to plant into tests/gold-intents.mjs as
   "a guard on the allowlist, registered nowhere". gold-intents was then registered and taken off the list, and all
   five went NOT CAUGHT: a mutant aimed at a real file's current state breaks the day that state is paid down. They
   now plant a synthetic guard that carries exactly the state each needs: present, flag-honest, allowlisted with a
   real reason, registered nowhere. */
const PLANT = 'planted-allowlisted-guard.mjs';
const withPlant = (t, reason = 'a synthetic guard planted by guard-hygiene --selftest; it exists only in memory') => ({ ...t,
  files: [...t.files, PLANT],
  sources: { ...t.sources, [PLANT]: "if (process.argv.includes('--selftest')) process.exit(0);\nprocess.exit(0);\n" },
  allowlist: { ...t.allowlist, guards: { ...t.allowlist.guards, [PLANT]: { reason } } } });
const PLANT_RE = PLANT.replace(/[.]/g, '\\.');

const MUTATIONS = [
  {
    id: 'M1-a-new-orphan-appears',
    why: 'THE MEASURED STATE: 12 files in tests/ were run by nothing, one of them (worker-accrual) with a '
       + 'header claiming otherwise. Someone writes a guard, never wires it up, and it reads as coverage forever',
    mutate: (t) => ({ ...t,
      files: [...t.files, 'brand-new-unwired-guard.mjs'],
      sources: { ...t.sources, 'brand-new-unwired-guard.mjs': 'process.exit(0);' } }),
    expect: /ORPHAN: tests\/brand-new-unwired-guard\.mjs/,
  },
  {
    id: 'M2-a-registered-guard-ignores-its-selftest-flag',
    why: 'THE OTHER MEASURED STATE: smoke.yml passes --selftest, Node ignores the unknown flag, the ordinary '
       + 'body runs and passes, and the log prints a green tick under a step called "mutation proof"',
    mutate: (t) => ({ ...t,
      // Strip the flag handling out of a guard the workflow calls with --selftest.
      sources: { ...t.sources, 'arm-flag-honesty.mjs': t.sources['arm-flag-honesty.mjs']
        .replace(/argv[^;\n]{0,80}\.includes\(\s*'--selftest'/g, "false && ('x'")
        .replace(/===\s*'--selftest'/g, "=== '--nope'") } }),
    expect: /VACUOUS PROOF: .*arm-flag-honesty\.mjs never branches on --selftest/,
  },
  {
    id: 'M3-an-allowlist-entry-with-no-argument-in-it',
    why: 'the cheapest way to silence rule 1 is a one-word reason. The allowlist is where the debt is '
       + 'written down; "TODO" is a quieter orphan, not a decision',
    mutate: (t) => withPlant(t, 'later'),
    expect: new RegExp(`UNREASONED: tests/${PLANT_RE}`),
  },
  {
    id: 'M4-a-registered-guard-file-is-deleted',
    why: 'a guard is removed and its workflow step is not, so CI runs `node tests/x.mjs` against nothing. '
       + 'Depending on the shell that is either a loud failure or a skipped step',
    mutate: (t) => {
      const s = { ...t.sources }; delete s['arm-flag-honesty.mjs'];
      return { ...t, files: t.files.filter((f) => f !== 'arm-flag-honesty.mjs'), sources: s };
    },
    expect: /MISSING: smoke\.yml runs .*arm-flag-honesty\.mjs does not exist/,
  },
  {
    id: 'M5-the-allowlist-names-a-file-that-is-gone',
    why: 'a guard is deleted and its allowlist entry outlives it. A list of absent files makes the present '
       + 'ones harder to see, which is how the list stops being read at all',
    mutate: (t) => ({ ...t, allowlist: { ...t.allowlist,
      guards: { ...t.allowlist.guards, 'long-since-deleted.mjs': { reason: 'x'.repeat(60) } } } }),
    expect: /GHOST: .*long-since-deleted\.mjs, which does not exist/,
  },
  {
    id: 'M6-the-debt-is-paid-but-the-ledger-still-says-owed',
    why: 'somebody registers an allowlisted guard and forgets to remove the entry. The list then '
       + 'over-reports the debt, which is how a list stops being trusted and then stops being pruned',
    mutate: (t) => { const u = withPlant(t);
      return { ...u, workflowText: u.workflowText + `\n      - name: adopted\n        run: node tests/${PLANT}\n` }; },
    expect: new RegExp(`STALE ALLOWLIST ENTRY: tests/${PLANT_RE}`),
  },
  {
    id: 'M7-a-header-comment-is-not-an-implementation',
    why: 'THE PRECISE TRAP. Every one of these files DOCUMENTS its flags in a header comment. If the '
       + 'non-vacuity rule matched the text rather than a branch, it would pass on documentation alone — '
       + 'and would have certified every vacuous proof in the tree',
    mutate: (t) => ({ ...t,
      sources: { ...t.sources, 'arm-flag-honesty.mjs':
        '// Usage:\n//   node tests/arm-flag-honesty.mjs --selftest\n'
        + "const s = 'run with --selftest to prove it';\nconsole.log(s);\nprocess.exit(0);\n" } }),
    expect: /VACUOUS PROOF: .*arm-flag-honesty\.mjs never branches on --selftest/,
  },
  {
    id: 'M8-a-proof-step-with-no-plain-run-beside-it',
    why: 'THE 2026-09-12 STATE: 23 steps were registered with ONLY a mutation flag. A planted bad column '
       + 'in one guard\'s own SQL made every arm throw and the driver printed "All 6 mutations caught", '
       + 'exit 0, with nothing in CI running the plain body that was red',
    mutate: (t) => { const u = withPlant(t);
      return { ...u, workflowText: u.workflowText
        + `\n      - name: brand new proof, no floor\n        run: node tests/${PLANT} --selftest\n` }; },
    expect: new RegExp(`PROOF WITH NO FLOOR: smoke\\.yml runs tests/${PLANT_RE} ONLY with a mutation flag`),
  },
  {
    id: 'M9-the-floor-exemption-with-no-argument-in-it',
    why: 'the cheap way to silence rule 5 is a one-word exemption. An exemption that does not say why the '
       + 'plain run cannot gate is just an unregistered guard with paperwork',
    mutate: (t) => { const u = withPlant(t);
      return { ...u, workflowText: u.workflowText
        + `\n      - name: brand new proof, no floor\n        run: node tests/${PLANT} --selftest\n`,
      allowlist: { ...u.allowlist,
        proof_baseline: { ...(u.allowlist.proof_baseline || {}), [PLANT]: { reason: 'slow' } } } }; },
    expect: new RegExp(`UNREASONED FLOOR EXEMPTION: tests/${PLANT_RE}`),
  },
  {
    id: 'M10-a-run-smoke-spawn-that-passes-the-proof-flag',
    why: 'the floor rule must not be satisfiable by run-smoke spawning the guard WITH --selftest — that is '
       + 'the same one-sided proof in a different file, and counting it would reopen the hole',
    mutate: (t) => { const u = withPlant(t);
      return { ...u, workflowText: u.workflowText
        + `\n      - name: brand new proof, no floor\n        run: node tests/${PLANT} --selftest\n`,
      runSmokeSrc: u.runSmokeSrc
        + `\nawait spawn('node', [join(ROOT, 'tests', '${PLANT}'), '--selftest']);\n` }; },
    expect: new RegExp(`PROOF WITH NO FLOOR: smoke\\.yml runs tests/${PLANT_RE} ONLY with a mutation flag`),
  },
  {
    id: 'M11-a-hand-rolled-isMain-compare-in-a-guard',
    why: 'THE 2026-10-17 STATE: 40+ guards compared import.meta.url to process.argv[1] by hand; on Windows that is '
       + 'false and the guard exited 0 having checked nothing. Planted in a test and in a tool, both must be caught',
    mutate: (t) => ({ ...t,
      sources: { ...t.sources, 'planted-guard.mjs':
        "if (import.meta.url === pathToFileURL(process.argv[1] || '').href) { main(); }\n" },
      toolSources: { ...(t.toolSources || {}), 'tools/planted-tool.mjs':
        "const isMain = (process.argv[1] || '').endsWith('planted-tool.mjs');\n" } }),
    expect: /HAND-ROLLED isMain: planted-guard\.mjs line 1[\s\S]*|HAND-ROLLED isMain: tools\/planted-tool\.mjs line 1/,
  },
  {
    id: 'M12-a-hand-rolled-isMain-in-a-tool-alone',
    why: 'the tool half of the rule must bite on its own, not ride on the guard half',
    mutate: (t) => ({ ...t,
      toolSources: { ...(t.toolSources || {}), 'tools/planted-tool.mjs':
        "if (import.meta.url === `file://${process.argv[1]}`) { run(); }\n" } }),
    expect: /HAND-ROLLED isMain: tools\/planted-tool\.mjs line 1/,
  },
  {
    id: 'M13-a-bare-string-mention-is-not-a-chain',
    why: 'THE 2026-11-13 STATE: tests/mutant-control.mjs named \'tests/party-hunt-view.mjs\' in its REGISTERED '
       + 'table, so that guard read as chained while nothing ran its plain body and its function was long dropped. '
       + 'A file named in a data table, not imported or spawned, is still an orphan',
    mutate: (t) => ({ ...t,
      files: [...t.files, 'named-in-a-table.mjs'],
      sources: { ...t.sources,
        'named-in-a-table.mjs': 'process.exit(0);',
        'mutant-control.mjs': t.sources['mutant-control.mjs']
          .replace('export const REGISTERED = [', "export const REGISTERED = [\n  ['tests/named-in-a-table.mjs', '--mutate'],") } }),
    expect: /ORPHAN: tests\/named-in-a-table\.mjs/,
  },
  {
    id: 'M14-a-commented-out-command-is-not-a-registration',
    why: 'THE 2026-11-14 STATE: `# node tests/x.mjs` inside a run block read as a command here, while tests/run-ci-local.mjs '
       + '(the parser CI and ci-shape read) drops it. A guard commented out of its step stayed "registered" with nothing running it',
    mutate: (t) => ({ ...t,
      files: [...t.files, 'commented-out-guard.mjs'],
      sources: { ...t.sources, 'commented-out-guard.mjs': 'process.exit(0);\n' },
      workflowText: t.workflowText
        + '\n      - name: a step whose guard was commented out\n        run: |\n          # node tests/commented-out-guard.mjs\n          echo nothing\n' }),
    expect: /ORPHAN: tests\/commented-out-guard\.mjs/,
  },
  {
    id: 'M15-a-chain-from-a-guard-nobody-runs-is-not-a-chain',
    why: 'M13 one level down: a file imported only by a guard on the allowlist (run by hand) is run by nothing either, and '
       + 'counting it "chained" hid it. A chain has to start at something CI runs',
    mutate: (t) => { const u = withPlant(t);
      return { ...u,
        files: [...u.files, 'chained-by-a-hand-run.mjs'],
        sources: { ...u.sources, 'chained-by-a-hand-run.mjs': 'export const x = 1;\n',
          [PLANT]: u.sources[PLANT] + "import { x } from './chained-by-a-hand-run.mjs';\n" } }; },
    expect: /ORPHAN: tests\/chained-by-a-hand-run\.mjs/,
  },
  {
    id: 'M16-a-proof-arm-no-workflow-runs',
    why: 'THE 2026-11-13 AUDIT: ~29 guards branched on --selftest/--mutate and no workflow ran that arm; of the last ten, '
       + 'yard-table --selftest threw on a stale anchor and balance-lab parity had been red for five days. Plain-registered is not enough',
    mutate: (t) => ({ ...t,
      files: [...t.files, 'proof-nobody-runs.mjs'],
      sources: { ...t.sources, 'proof-nobody-runs.mjs': "if (process.argv.includes('--mutate')) process.exit(0);\nprocess.exit(0);\n" },
      workflowText: t.workflowText + '\n      - name: plain only\n        run: node tests/proof-nobody-runs.mjs\n' }),
    expect: /PROOF NEVER RUN: tests\/proof-nobody-runs\.mjs/,
  },
  {
    id: 'M17-a-tool-proof-in-a-subfolder-no-workflow-runs',
    why: 'tools/guard-anchors.mjs --unregistered read the top of tools/ only, so tools/hooks/bash-guard.mjs (the §2 hook) '
       + 'and six more subfolder proofs ran nowhere and were counted by nobody',
    mutate: (t) => ({ ...t, toolSources: { ...t.toolSources,
      'tools/planted/sub-proof.mjs': "if (process.argv.includes('--selftest')) process.exit(0);\n" } }),
    expect: /PROOF NEVER RUN: tools\/planted\/sub-proof\.mjs/,
  },
  {
    id: 'M18-a-proof-run-only-by-hand-dispatch-is-not-ci',
    why: 'a workflow_dispatch-only workflow (perf-measure.yml) runs when somebody remembers; registering a proof there must '
       + 'not count, or RULE 7 has a door that needs no schedule and no push',
    mutate: (t) => ({ ...t,
      toolSources: { ...t.toolSources, 'tools/planted/dispatch-proof.mjs': "if (process.argv.includes('--selftest')) process.exit(0);\n" },
      otherWorkflows: { ...(t.otherWorkflows || {}), 'planted-manual.yml': 'name: manual\non:\n  workflow_dispatch: {}\n'
        + 'jobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - name: by hand\n        run: node tools/planted/dispatch-proof.mjs --selftest\n' } }),
    expect: /PROOF NEVER RUN: tools\/planted\/dispatch-proof\.mjs/,
  },
  {
    id: 'M19-a-proof-exemption-with-no-argument-in-it',
    why: 'the cheap way to silence RULE 7 is a one-word proof_unrun entry; an exemption that does not say why the proof '
       + 'cannot run in CI is an unrun proof with paperwork',
    mutate: (t) => ({ ...t,
      toolSources: { ...t.toolSources, 'tools/planted/exempt-proof.mjs': "if (process.argv.includes('--mutate')) process.exit(0);\n" },
      allowlist: { ...t.allowlist, proof_unrun: { ...(t.allowlist.proof_unrun || {}), 'tools/planted/exempt-proof.mjs': { reason: 'slow' } } } }),
    expect: /UNREASONED PROOF EXEMPTION: tools\/planted\/exempt-proof\.mjs/,
  },
  {
    id: 'M20-the-proof-runs-but-the-exemption-stays',
    why: 'somebody wires an exempt proof and forgets the entry: the list then over-reports the debt and stops being read',
    mutate: (t) => ({ ...t,
      toolSources: { ...t.toolSources, 'tools/planted/paid-proof.mjs': "if (process.argv.includes('--mutate')) process.exit(0);\n" },
      workflowText: t.workflowText + '\n      - name: now wired\n        run: node tools/mutant-gate.mjs node tools/planted/paid-proof.mjs --mutate\n',
      allowlist: { ...t.allowlist, proof_unrun: { ...(t.allowlist.proof_unrun || {}), 'tools/planted/paid-proof.mjs': { reason: 'x'.repeat(60) } } } }),
    expect: /STALE PROOF EXEMPTION: tools\/planted\/paid-proof\.mjs/,
  },
  {
    id: 'M21-a-proof-exemption-for-a-file-that-is-gone',
    why: 'a tool is deleted and its proof_unrun entry outlives it',
    mutate: (t) => ({ ...t, allowlist: { ...t.allowlist,
      proof_unrun: { ...(t.allowlist.proof_unrun || {}), 'tools/long-gone-proof.mjs': { reason: 'x'.repeat(60) } } } }),
    expect: /GHOST: tests\/guards-unregistered\.json proof_unrun names tools\/long-gone-proof\.mjs/,
  },
];

/* The CLI runs only when this file IS the entry point: tools/guard-anchors.mjs imports
   implementsFlag so the NON-VACUITY detector and the anchor map agree on what a proof is. */
if (isMain(import.meta.url)) {
  if (argv.includes('--list')) {
    for (const m of MUTATIONS) console.log(m.id + '  —  ' + m.why);
    process.exit(0);
  }

  if (argv.includes('--selftest')) {
    console.log('guard-hygiene --selftest: each mutation must turn the verdict RED\n');
    const real = readTree();
    let bad = 0;

    // CLEAN control: a guard that is red at rest is red for everything.
    const clean = verdict(real);
    if (clean.problems.length) {
      bad++;
      console.log('  FAIL  CLEAN control is RED against the real tree — the mutations below prove nothing');
      for (const p of clean.problems) console.log('          ' + p.slice(0, 170));
    } else {
      console.log(`  ok    CLEAN control is GREEN (${clean.stats.guards} guards: ${clean.stats.registered} in `
        + `smoke.yml, ${clean.stats.via_run_smoke} via run-smoke, ${clean.stats.chained} chained, `
        + `${clean.stats.allowlisted} allowlisted; ${clean.stats.proof_steps} proof steps all non-vacuous)`);
    }
    console.log('        the tree the mutations are planted into must itself be clean');

    for (const m of MUTATIONS) {
      let out;
      try { out = verdict(m.mutate(real)); }
      catch (e) { out = { problems: ['THREW: ' + e.message] }; }
      if (out.problems.some((p) => m.expect.test(p))) {
        console.log(`  ok    ${m.id} — caught`);
      } else {
        bad++;
        console.log(`  FAIL  ${m.id} — NOT CAUGHT (${out.problems.length} problem(s), none matching ${m.expect})`);
        for (const p of out.problems.slice(0, 3)) console.log('          ' + p.slice(0, 170));
      }
      console.log(`        ${m.why}`);
    }

    console.log('');
    if (bad) { console.error(`guard-hygiene --selftest FAILED — ${bad} unproven`); process.exit(1); }
    console.log(`guard-hygiene --selftest PASSED — clean control green, ${MUTATIONS.length}/${MUTATIONS.length} mutations caught.`);
    process.exit(0);
  }

  // ── The plain run ────────────────────────────────────────────────────────
  if (!existsSync(ALLOWLIST)) {
    console.error('guard-hygiene: tests/guards-unregistered.json is missing. It is not optional — it is where '
      + 'the "we know, and here is why" half of this rule lives. An empty {"guards":{}} is a valid starting point.');
    process.exit(1);
  }

  const tree = readTree();
  const { problems, stats } = verdict(tree);

  if (AS_JSON) {
    console.log(JSON.stringify({ ok: problems.length === 0, stats, problems }, null, 1));
  } else {
    console.log('guard hygiene — every guard reachable, every claimed proof real\n');
    console.log(`  ${stats.guards} guard file(s) under tests/`);
    console.log(`    ${stats.registered} registered in a workflow that runs on its own (smoke.yml, nightly-loop.yml)`);
    console.log(`    ${stats.via_run_smoke} invoked by tests/run-smoke.mjs`);
    console.log(`    ${stats.chained} chained from a guard that runs`);
    console.log(`    ${stats.allowlisted} on tests/guards-unregistered.json, each with a written reason`);
    console.log(`  ${stats.proof_steps} workflow step(s) claim a mutation proof; each resolves to a file that `
      + 'branches on the flag');
    console.log(`  ${stats.proof_capable} proof-capable file(s) under tests/ and tools/: ${stats.proof_capable - stats.proof_unrun} `
      + `run with their proof flag in CI, ${stats.proof_unrun} in proof_unrun with a reason\n`);
    if (problems.length) {
      console.error(`FAILED — ${problems.length} problem(s):\n`);
      for (const p of problems) console.error('  ✗ ' + p + '\n');
    } else {
      console.log('PASSED — no orphans, no ghosts, no stale entries, no vacuous proofs.');
    }
  }
  process.exit(problems.length ? 1 : 0);
}
