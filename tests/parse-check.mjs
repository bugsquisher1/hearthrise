#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/parse-check.mjs — EVERY SHIPPED SCRIPT STILL PARSES.
//
//   node tests/parse-check.mjs             # the guard
//   node tests/parse-check.mjs --list      # what it checks, and what it skips
//   node tests/parse-check.mjs --selftest  # every planted defect must be CAUGHT
//
// EXIT CODES: 0 green · 1 a file does not parse / a mutation was missed ·
//             2 HARNESS FAULT (nothing was graded; re-run alone)
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
// 2026-09-12, b536 lane: `tools/vitals.mjs` shipped with a BACKTICK inside an
// SQL comment that lived inside a JS template literal:
//
//     const REFUSALS = `
//     with x as (
//       -- `verbs` is read through to_jsonb(h) rather than named directly …
//
// The backtick ends the template literal, so everything after it was parsed as
// JavaScript and the ENTIRE TOOL failed to load — not just the code path that
// had been edited. `node --check tools/vitals.mjs` said so in 40 ms:
//     SyntaxError: Unexpected identifier 'verbs'
// Nothing in this repository ran that command. Measured the same day:
// `grep -rl "node --check" tests tools .github` returned ZERO files. The defect
// reached integration, blocked a merge, and was found by a human reading the
// branch — which is the most expensive way to find a syntax error.
//
// The class is wider than one backtick. Every one of these is invisible until
// the file is EXECUTED, and a tool that is only run by an operator once a
// session (vitals), or only on a branch that happens to be tested, can sit
// broken for days:
//   · a backtick, `${`, or an unescaped quote inside a template literal;
//   · an unterminated string or comment after a hand-edit;
//   · a stray brace from a bad merge resolution.
// A guard that spawns `node --check` over every shipped script costs seconds
// and turns all of it into a build failure with a filename in it.
//
// ── WHAT IT CHECKS, AND WHY THOSE THREE TREES ───────────────────────────
//   tools/*.mjs   the operator surface — vitals, apply-migration, pack-edge,
//                 post-changelog. These run by hand, so nothing else notices.
//   tests/*.mjs   the guards themselves. A guard that cannot parse is a guard
//                 that reports nothing, and CI would show it as a red step with
//                 no failing assertion in it.
//   src/**/*.js   the game. `package.json` declares "type": "module", so a .js
//                 file here is parsed as ESM by --check exactly as the browser
//                 parses it as a module. MEASURED 2026-09-12: all 214 files
//                 pass, including src/legacy.js, which is loaded as a classic
//                 script — nothing in it is ESM-illegal today, and this guard
//                 is what makes that keep being true.
//
// ── WHAT IT DELIBERATELY DOES NOT CHECK ─────────────────────────────────
//   supabase/functions/**  Deno, and index.ts is TypeScript. `node --check`
//                 cannot parse TS and would fail on the entrypoint, so a
//                 blanket sweep there would have to carve out the one file that
//                 matters most. The edge bundle has its own gate
//                 (tools/pack-edge.mjs) and its own deploy-time parse.
//   *.json / *.css / *.html   not JavaScript. Their own guards own them.
//   Anything under a dot-directory (node_modules, .git, .claude worktrees).
//
// And it does not judge whether a file WORKS. Parsing is the floor, not the
// bar: a file can parse perfectly and still be wrong. What it can no longer be
// is broken in a way that forty milliseconds would have caught.
// ════════════════════════════════════════════════════════════════════════
import { readdirSync, writeFileSync, mkdtempSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '..');
const CONCURRENCY = 8;

/* The trees, and the rule for each. `deep` walks; otherwise only the top level,
   which is where tools/ and tests/ actually keep their scripts. */
const TREES = [
  { dir: 'tools', ext: '.mjs', deep: false },
  { dir: 'tests', ext: '.mjs', deep: false },
  { dir: 'src', ext: '.js', deep: true },
];

function collect() {
  const out = [];
  for (const t of TREES) {
    const walk = (d) => {
      let entries;
      try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        // Dot-entries are never shipped: node_modules is not here, but scratch
        // copies, editor backups and this guard's own selftest temp dirs are.
        if (e.name.startsWith('.')) continue;
        const p = join(d, e.name);
        if (e.isDirectory()) { if (t.deep) walk(p); continue; }
        if (e.name.endsWith(t.ext)) out.push(p);
      }
    };
    walk(join(ROOT, t.dir));
  }
  return out.sort();
}

const checkOne = (file) => new Promise((resolve) => {
  execFile(process.execPath, ['--check', file], { timeout: 30_000 }, (err, _stdout, stderr) => {
    if (!err) { resolve(null); return; }
    // node --check prints the file, the offending line, a caret, then the
    // SyntaxError. Keep the SyntaxError line — that is the useful half.
    const lines = String(stderr || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const syn = lines.find((l) => /^[A-Za-z]*Error\b/.test(l)) || lines[0] || 'unknown parse failure';
    resolve({ file, reason: syn });
  });
});

/** Spawn `node --check` over every path with a bounded pool. */
async function checkAll(files) {
  const queue = [...files];
  const failures = [];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, queue.length)) }, async () => {
    for (;;) {
      const f = queue.shift();
      if (f === undefined) return;
      const bad = await checkOne(f);
      if (bad) failures.push(bad);
    }
  }));
  return failures.sort((a, b) => a.file.localeCompare(b.file));
}

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   A guard that has never been red is not a guard. Each entry appends ONE real
   defect to a COPY of a real repo file in an OS temp directory (never in the
   tree), and `--selftest` requires the checker to report every one of them —
   plus a positive control that the untouched copy passes, because a checker
   that calls everything broken is as useless as one that calls nothing broken.

   `backtick_in_template` is the b536 defect itself, reproduced exactly: a
   backtick inside an SQL comment inside a template literal. */
const MUTATIONS = {
  backtick_in_template: {
    why: 'THE DEFECT ITSELF (b536, tools/vitals.mjs): a backtick inside an SQL comment inside a JS '
       + 'template literal ends the string, and everything after it is parsed as JavaScript. The whole '
       + 'tool stops loading, not just the edited path.',
    tail: '\nconst Q = `\nselect 1\n  -- `verbs` is read through to_jsonb(h)\n`;\n',
  },
  unescaped_interpolation: {
    why: 'a `${` left in a template literal by a half-finished edit. Parses as an interpolation and '
       + 'swallows the rest of the file.',
    tail: '\nconst Q2 = `select ${ from x`;\n',
  },
  unterminated_string: {
    why: 'a quote dropped by a hand-edit. The classic one-character break that only shows up when '
       + 'something imports the file.',
    tail: "\nconst S = 'select 1;\n",
  },
  stray_brace: {
    why: 'a leftover brace from a merge resolution. This is the shape a conflict resolved by hand '
       + 'leaves behind, which is exactly why the Coordinator no longer resolves conflicts by hand.',
    tail: '\n}\n',
  },
};

/** A disposable package root so `--check` treats a .mjs/.js copy the way the
 *  repo does ("type": "module"). Outside the tree, so a crashed run cannot
 *  leave a file the sweep above would then try to parse. */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'hr-parse-'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
  return dir;
}

async function selftest() {
  // A real repo file, not a synthetic one: the proof has to be that a defect
  // planted in something we actually ship is caught.
  const donor = join(ROOT, 'tools', 'vitals.mjs');
  let pristine;
  try { pristine = readFileSync(donor, 'utf8'); }
  catch { const e = new Error(`selftest donor missing: ${donor}`); e.harness = true; throw e; }

  const dir = sandbox();
  try {
    // POSITIVE CONTROL first. If the untouched copy does not pass, every
    // "CAUGHT" below is meaningless — the checker would be failing everything.
    const clean = join(dir, 'clean.mjs');
    copyFileSync(donor, clean);
    const controlFail = await checkOne(clean);
    if (controlFail) {
      const e = new Error(`selftest control FAILED: an untouched copy of tools/vitals.mjs does not `
        + `parse (${controlFail.reason}). Fix the tree before reading this guard.`);
      e.harness = true; throw e;
    }

    let missed = 0;
    for (const [id, m] of Object.entries(MUTATIONS)) {
      const f = join(dir, `${id}.mjs`);
      writeFileSync(f, pristine + m.tail);
      const bad = await checkOne(f);
      // Caught means: reported AND the report names the file, because a red
      // that does not say which file is a red nobody can act on.
      const caught = Boolean(bad) && bad.file === f && /Error/.test(bad.reason);
      console.log(`  ${caught ? 'CAUGHT ' : 'MISSED '} ${id}`
        + (bad ? `  (${bad.reason.slice(0, 90)})` : '  (parsed clean)'));
      if (!caught) missed += 1;
    }
    console.log(missed === 0
      ? `\nparse-check --selftest: ${Object.keys(MUTATIONS).length}/${Object.keys(MUTATIONS).length} `
        + 'planted defects CAUGHT, and an untouched copy still passes'
      : `\nparse-check --selftest: ${missed} planted defect(s) MISSED`);
    return missed === 0 ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const files = collect();

  if (argv.includes('--list')) {
    console.log('parse-check trees:');
    for (const t of TREES) {
      const n = files.filter((f) => f.startsWith(join(ROOT, t.dir))).length;
      console.log(`  ${t.dir}/${t.deep ? '**/' : ''}*${t.ext}  ${n} file(s)`);
    }
    console.log(`\n  ${files.length} file(s) total. Skipped by design: supabase/functions/** (Deno + `
      + 'TypeScript), dot-directories, and anything that is not JavaScript.');
    console.log('\nmutations:');
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`  ${id}\n      ${m.why}\n`);
    return 0;
  }

  if (argv.includes('--selftest')) return selftest();

  // FAIL CLOSED. A sweep that finds nothing must not report success — that is
  // how a guard survives a directory rename as a permanent green tick.
  if (files.length < 100) {
    console.error(`parse-check: found only ${files.length} file(s) across ${TREES.length} trees. `
      + 'Something moved; a sweep that covers nothing must not pass.');
    return 2;
  }

  const t0 = Date.now();
  const failures = await checkAll(files);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  if (failures.length) {
    console.error(`parse-check: RED — ${failures.length} file(s) do not parse\n`);
    for (const f of failures) console.error(`  x ${relative(ROOT, f.file).replace(/\\/g, '/')}  ${f.reason}`);
    console.error('\nRun `node --check <file>` for the line and caret. A file that does not parse '
      + 'does not run: every importer of it is dead, not just the edited path.');
    return 1;
  }
  console.log(`parse-check: OK — ${files.length} shipped script(s) parse (${secs}s): `
    + `${TREES.map((t) => `${t.dir}/${t.deep ? '**/' : ''}*${t.ext}`).join(', ')}.`);
  return 0;
}

process.exit(await main());
