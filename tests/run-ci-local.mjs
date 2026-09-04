#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/run-ci-local.mjs — RUN WHAT CI RUNS, LOCALLY, DERIVED FROM CI
//
//   node tests/run-ci-local.mjs            the CI-only steps (no browser)
//   node tests/run-ci-local.mjs --all      …plus the in-page suite, i.e. the
//                                          whole workflow, exactly as CI runs it
//   node tests/run-ci-local.mjs --list     print the derived command list, run nothing
//
// ── WHY THIS EXISTS (P0 PROCESS FAILURE, proven 2026-09-04) ─────────────────
// .github/workflows/smoke.yml runs ONE step that anybody ran locally — the
// in-page suite, `node tests/run-smoke.mjs` — and THIRTEEN that nobody did:
// schema-drift (+ --mutate + --live-selftest), live-hash-drift (+ --selftest +
// --mutate), renown-kill-faucet --selftest, restore-census (+ --mutate +
// --baseline-selftest), conservation-fuzz --selftest, activity-intent
// --selftest, claim-intent --selftest, clan-journal-guard --selftest,
// anon-rate-gate --selftest, raid-band-denial --selftest, raid-card-copy,
// rpc-resolution, edge-jwt-gate --strict.
//
// On 2026-09-04 the GitHub Actions history for `main` showed FORTY completed
// runs since 2026-08-29 and ZERO green, while the in-page step passed in every
// one of them. Every release from b488 onward was therefore gated on a local
// command that is STRICTLY WEAKER than CI — and the guards that were red are the
// ones that watch the database: whether the repo can rebuild it, whether
// production carries the bodies the repo believes it carries, which rows only a
// backup gives back, and whether value is conserved. Those are exactly the
// guards that matter most after cutover, when the database is the only copy of
// every player's progression.
//
// The failure was not that the guards were bad; each red had a real, small
// cause. The failure was that NOBODY COULD SEE THEM without opening a browser
// tab on github.com, so a red build was indistinguishable from a build nobody
// had looked at. This file closes that: one command, same steps, same flags,
// same order, on the machine where the fix gets written.
//
// ── THE LIST IS DERIVED FROM smoke.yml, NOT COPIED FROM IT ──────────────────
// A second copy of the step list is a drift generator, and a drift generator in
// the thing whose whole job is "local equals CI" defeats itself on its first
// edit. So this PARSES the workflow and runs the `run:` lines it finds, in
// order. Add a step to CI and it runs here on the next invocation with no edit
// to this file; change a flag in CI and the flag changes here.
//
// Two steps are SKIPPED, by name, and both skips are declared below and
// VERIFIED: if a skipped name is no longer a step in the workflow this exits 2,
// rather than quietly running one fewer thing than CI does.
//
// ONE DELIBERATE DIFFERENCE FROM CI, IN THE SAFE DIRECTION: every step here runs
// even after an earlier one fails. In the workflow the guards carry
// `if: ${{ !cancelled() }}` for exactly that reason, but the first two steps do
// not, so a red cache-buster check ends the GitHub job and hides everything
// behind it. Locally that trade is wrong — you want the whole board in one run,
// which is the entire lesson of this file's existence — so nothing short-circuits
// and the summary table at the end is always complete.
//
// ── THE RULE THIS ENFORCES ─────────────────────────────────────────────────
//   A RELEASE IS GREEN ONLY WHEN BOTH THE LOCAL --ci RUN AND THE GITHUB RUN ON
//   THE RELEASE COMMIT ARE GREEN. Neither alone is a gate: the local run cannot
//   see a CI-environment problem, and the GitHub run cannot be waited on while a
//   release is being assembled.
//
// Exit: 0 every step green · 1 a step failed · 2 a harness problem (the workflow
// could not be parsed, or a declared skip no longer exists).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const WORKFLOW = join(ROOT, '.github', 'workflows', 'smoke.yml');

const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
const LIST = argv.includes('--list');

/* THE DECLARED SKIPS. Each names a step that exists in the workflow and says
   what running it locally would mean. Nothing else is ever skipped, and a name
   that stops matching a step is a harness failure — that is what stops this from
   drifting into "runs most of CI". */
const SKIP = [
  ['Install Playwright + Chromium',
    'environment setup, not a gate: npm install + npx playwright install --with-deps installs '
    + 'system packages and needs root on Linux. If a guard fails here for a missing dependency, '
    + 'run those two commands by hand once.'],
  ['Smoke suite (headless)',
    'the ONE step that already runs locally today (node tests/run-smoke.mjs) and the one this '
    + 'file exists to complement. Pass --all to include it and run the whole workflow.'],
];

// ── the parser ───────────────────────────────────────────────────────────
// smoke.yml is a plain, regular workflow: `steps:` at indent 4, each step at
// indent 6 opening with "- ", its keys at indent 8, and block `run:` bodies at
// indent 10. Deliberately NOT a general YAML implementation — a third-party
// parser would be a dependency running inside the thing that gates the build,
// and the shape it has to read is four lines of rules.
function parseSteps(text) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => /^ {4}steps:\s*$/.test(l));
  if (at < 0) throw new Error('no "    steps:" block in ' + WORKFLOW);
  const steps = [];
  let cur = null;
  let inRun = false;
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*$/.test(l)) { if (inRun && cur) cur.run.push(''); continue; }
    const indent = l.length - l.trimStart().length;
    if (indent < 6) break;                       // left the steps: block
    if (indent === 6 && l.trimStart().startsWith('- ')) {
      cur = { name: null, run: [], uses: null };
      steps.push(cur);
      inRun = false;
      applyKey(cur, l.trimStart().slice(2));
      if (cur._runBlock) { inRun = true; cur._runBlock = false; }
      continue;
    }
    if (!cur) continue;
    if (indent === 8) {
      inRun = false;
      applyKey(cur, l.trim());
      if (cur._runBlock) { inRun = true; cur._runBlock = false; }
      continue;
    }
    if (inRun && indent >= 10) cur.run.push(l.slice(10));
  }
  if (!steps.length) throw new Error('the steps: block parsed to zero steps');
  return steps.map((s) => ({
    name: s.name,
    uses: s.uses,
    run: s.run.join('\n').split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('#')),
  }));
}
function applyKey(step, s) {
  const m = /^([A-Za-z_-]+):\s*(.*)$/.exec(s);
  if (!m) return;
  const [, k, v] = m;
  if (k === 'name') step.name = v.replace(/^['"]|['"]$/g, '');
  else if (k === 'uses') step.uses = v;
  else if (k === 'run') {
    if (v === '|' || v === '>' || v === '|-' || v === '>-') step._runBlock = true;
    else if (v) step.run.push(v);
  }
}

// ── the runner ───────────────────────────────────────────────────────────
// `node …` is spawned on THIS interpreter (so the local Node version is the one
// under test) and `bash …` on bash; anything else goes through the platform
// shell and is reported as such, because a step this file cannot run natively is
// a step whose local result deserves a second look.
function runCommand(cmd) {
  const parts = cmd.split(/\s+/);
  let file = parts[0];
  let args = parts.slice(1);
  const opts = { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' };
  if (file === 'node') file = process.execPath;
  else if (file !== 'bash') { opts.shell = true; file = cmd; args = []; }
  const r = spawnSync(file, args, opts);
  if (r.error) return { status: 2, error: r.error.message };
  return { status: r.status === null ? 2 : r.status };
}

/* CRLF, because smoke.yml has them and a `\r` left on the end of `name:` makes
   every skip-list comparison fail — which is exactly the harness error this file
   raises, arriving for the wrong reason. Normalise once, at the boundary. */
const text = (await readFile(WORKFLOW, 'utf8')).split('\r\n').join('\n');
let steps;
try { steps = parseSteps(text); } catch (e) {
  console.error('CI-LOCAL: could not read the workflow — ' + e.message);
  console.error('  This file DERIVES its step list from .github/workflows/smoke.yml so the two');
  console.error('  cannot drift. Fix the parser against the workflow\'s real shape; do NOT');
  console.error('  hardcode a second copy of the list here.');
  process.exit(2);
}

// The skip list must still describe reality.
const names = steps.map((s) => s.name);
const missing = SKIP.filter(([n]) => !names.includes(n)).map(([n]) => n);
if (missing.length) {
  console.error('CI-LOCAL: these steps are on the skip list but no longer exist in smoke.yml: '
    + missing.join(', '));
  console.error('  A skip that no longer matches a step means this run is quietly doing LESS than');
  console.error('  CI. Update SKIP in tests/run-ci-local.mjs in the same commit as the workflow.');
  process.exit(2);
}

const skipNames = new Set(
  SKIP.filter(([n]) => !(ALL && n === 'Smoke suite (headless)')).map(([n]) => n));
const plan = [];
for (const s of steps) {
  if (!s.run.length) continue;                   // `uses:` steps: checkout, setup-node, upload
  if (skipNames.has(s.name)) { plan.push({ name: s.name, skipped: true }); continue; }
  plan.push({ name: s.name, cmds: s.run });
}

const live = plan.filter((p) => !p.skipped);
const total = live.reduce((n, p) => n + p.cmds.length, 0);
console.log(`CI-LOCAL — ${live.length} step(s), ${total} command(s), derived from `
  + `.github/workflows/smoke.yml${ALL ? '  (--all: the in-page suite included)' : ''}`);
for (const [n, why] of SKIP) {
  if (skipNames.has(n)) console.log(`  skipped: ${n}\n           ${why}`);
}
console.log('');

if (LIST) {
  for (const p of plan) {
    if (p.skipped) { console.log(`  (skipped) ${p.name}`); continue; }
    console.log(`  ${p.name}`);
    for (const c of p.cmds) console.log(`      ${c}`);
  }
  process.exit(0);
}

const t0 = Date.now();
const results = [];
for (const p of live) {
  for (const cmd of p.cmds) {
    const started = Date.now();
    console.log(`\n${''.padEnd(78, '-')}\n> ${p.name}\n  $ ${cmd}\n`);
    const r = runCommand(cmd);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    results.push({ step: p.name, cmd, status: r.status, secs, error: r.error });
    console.log(`\n  ${r.status === 0 ? 'GREEN' : `EXIT ${r.status}`} · ${secs}s`);
  }
}

console.log(`\n${''.padEnd(78, '=')}\nCI-LOCAL RESULTS\n${''.padEnd(78, '-')}`);
for (const r of results) {
  console.log(`  ${r.status === 0 ? 'GREEN  ' : 'RED    '} ${String(r.secs).padStart(7)}s  ${r.cmd}`
    + (r.error ? `  (${r.error})` : ''));
}
const red = results.filter((r) => r.status !== 0);
console.log(''.padEnd(78, '-'));
console.log(`  ${results.length - red.length}/${results.length} green · `
  + `${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (red.length) {
  console.log('\n  A RELEASE IS GREEN ONLY WHEN BOTH THIS RUN AND THE GITHUB RUN ON THE RELEASE');
  console.log('  COMMIT ARE GREEN. Fix the guard, never the guard\'s teeth.');
}
process.exitCode = red.length ? 1 : 0;
