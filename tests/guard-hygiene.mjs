#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/guard-hygiene.mjs — THE GUARDS ARE REACHABLE, AND THEIR PROOFS ARE REAL
//
//   node tests/guard-hygiene.mjs             # the guard
//   node tests/guard-hygiene.mjs --list      # the mutation catalogue
//   node tests/guard-hygiene.mjs --selftest  # every mutation must be CAUGHT
//   node tests/guard-hygiene.mjs --json
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
// ── THE TWO RULES ───────────────────────────────────────────────────────
//   REACHABILITY  every tests/*.mjs is (a) named in a run: line in smoke.yml,
//                 (b) imported or spawned by tests/run-smoke.mjs, (c) imported
//                 or spawned by another guard, or (d) listed in
//                 tests/guards-unregistered.json with a non-empty reason.
//   NON-VACUITY   every smoke.yml step whose command passes --selftest (or
//                 --mutate / --live-selftest / --baseline-selftest) resolves to
//                 a file that BRANCHES on that flag.
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
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Every `run:` command in the workflow, as raw strings. */
function workflowCommands(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = /^\s*run:\s*(.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
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
      out.push(l.trim());
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

/** Files referenced in an EXECUTABLE position by another file's source. */
function references(src) {
  const out = new Set();
  // static / dynamic import of a sibling guard
  for (const m of src.matchAll(/from\s+'\.\/([A-Za-z0-9._-]+\.mjs)'/g)) out.add(m[1]);
  for (const m of src.matchAll(/import\s*\(\s*'\.\/([A-Za-z0-9._-]+\.mjs)'\s*\)/g)) out.add(m[1]);
  // spawned: join(ROOT, 'tests', 'x.mjs') — the shape run-smoke uses
  for (const m of src.matchAll(/'tests'\s*,\s*'([A-Za-z0-9._-]+\.mjs)'/g)) out.add(m[1]);
  for (const m of src.matchAll(/'tests\/([A-Za-z0-9._-]+\.mjs)'/g)) out.add(m[1]);
  return out;
}

/**
 * Does `src` BRANCH on `flag`? Not "does it mention it" — a header comment
 * documenting `--selftest` is exactly the vacuous case this rule exists for,
 * and every one of these files documents its flags in a header.
 *
 * So: strip comments and strings-that-are-clearly-prose first, then require the
 * flag to appear inside an argv test.
 */
function implementsFlag(src, flag) {
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
export function verdict({ files, workflowText, runSmokeSrc, sources, allowlist }) {
  const problems = [];
  const cmds = workflowCommands(workflowText);

  // Who is reachable, and how?
  const registered = new Map();   // file -> [flags seen on its run: lines]
  for (const cmd of cmds) {
    const { files: named, flags } = namedIn(cmd);
    for (const f of named) {
      if (!registered.has(f)) registered.set(f, []);
      registered.get(f).push({ cmd, flags });
    }
  }

  const fromRunSmoke = references(runSmokeSrc);
  const chained = new Map();      // file -> the guard that chains it
  for (const [name, src] of Object.entries(sources)) {
    if (name === 'run-smoke.mjs') continue;
    /* THIS FILE'S OWN mutation catalogue names other guards in string literals
       ("run: node tests/enchant-intent.mjs"), and a meta-guard that made every
       file it mentions look reachable would switch off the rule it exists to
       enforce. Skip self. */
    if (name === 'guard-hygiene.mjs') continue;
    for (const ref of references(src)) if (ref !== name && !chained.has(ref)) chained.set(ref, name);
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

  const stats = {
    guards: files.length - [...RUNNERS].filter((r) => files.includes(r)).length,
    registered: registered.size,
    via_run_smoke: fromRunSmoke.size,
    chained: chained.size,
    allowlisted: Object.keys(allowed).filter((k) => !k.startsWith('$')).length,
    proof_steps: [...registered.values()].flat().filter((u) => u.flags.length).length,
  };
  return { problems, stats };
}

// ── Reading the real tree ────────────────────────────────────────────────
function readTree() {
  const files = guardFiles();
  const sources = {};
  for (const f of files) sources[f] = readFileSync(join(HERE, f), 'utf8');
  return {
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
    mutate: (t) => ({ ...t, allowlist: { ...t.allowlist,
      guards: { ...t.allowlist.guards, 'enchant-intent.mjs': { reason: 'later' } } } }),
    expect: /UNREASONED: tests\/enchant-intent\.mjs/,
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
    mutate: (t) => ({ ...t,
      workflowText: t.workflowText + '\n      - name: adopted\n        run: node tests/enchant-intent.mjs\n' }),
    expect: /STALE ALLOWLIST ENTRY: tests\/enchant-intent\.mjs/,
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
];

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
  console.log(`    ${stats.registered} registered in .github/workflows/smoke.yml`);
  console.log(`    ${stats.via_run_smoke} invoked by tests/run-smoke.mjs`);
  console.log(`    ${stats.chained} chained from another guard`);
  console.log(`    ${stats.allowlisted} on tests/guards-unregistered.json, each with a written reason`);
  console.log(`  ${stats.proof_steps} workflow step(s) claim a mutation proof; each resolves to a file that `
    + 'branches on the flag\n');
  if (problems.length) {
    console.error(`FAILED — ${problems.length} problem(s):\n`);
    for (const p of problems) console.error('  ✗ ' + p + '\n');
  } else {
    console.log('PASSED — no orphans, no ghosts, no stale entries, no vacuous proofs.');
  }
}
process.exit(problems.length ? 1 : 0);
