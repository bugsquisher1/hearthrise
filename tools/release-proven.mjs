#!/usr/bin/env node
// tools/release-proven.mjs — IS THIS COMMIT ALREADY PROVED GREEN? smoke.yml's first job (release-proven), on a push to main.
//
//   node tools/release-proven.mjs             on a GitHub push to main: proven=true|false to $GITHUB_OUTPUT; anywhere else it says
//                                             why nothing is skipped and exits 0 (run-ci-local runs it like any step)
//   node tools/release-proven.mjs --selftest  the decision on planted runs and events; each rule dropped in turn lets a planted run through
//
// WHY (lane/ci-speed, 2026-11-18). main is only pushed to a commit its release run already proved green (CLAUDE.md §3.3:
// release green, then push main). smoke.yml then ran the whole matrix again on that commit: 44029348045 held the runner slots
// for 31 min (229 job-min), 43715000064 for 2 h, while the Pages deploy and the next fix-forward queued behind it. Since 11-02
// tools/mutant-gate.mjs skipped main's PROOFS on a release run's say-so; this skips the whole run. Every other job `needs`
// release-proven and is skipped when it answers proven=true, so main's run is green in about a minute.
//
// IT CANNOT BE FOOLED INTO A SKIP. proven=true only when GitHub lists a run that meets every one of PROOF_RULES
// (tools/lib/ci-history.mjs, the same rule mutant-gate reads): this very commit, .github/workflows/smoke.yml, a release/**
// branch, event push (a dispatch can carry a rehearse_range that narrows its plan, and its inputs cannot be read back),
// completed with conclusion success, this repository (not a fork), not this run. Only a push to main asks at all: the
// nightly schedule, every dispatch, a pull request and every other branch run in full. A read that fails, an answer that
// does not parse, or no such run: proven=false, and every job runs as it always did. A failure here can only cost a full run.
// mutant-anchors: none — the selftest plants into planted run lists and copies of the rule list, never a file
import { appendFileSync } from 'node:fs';
import { isMain } from '../tests/_is-main.mjs';
import { PROOF_RULES, provedBy, readProved } from './lib/ci-history.mjs';

/** Whether this event may skip at all. Pure. Null when it may; else the reason it runs in full. */
export function whyNotAsked(env) {
  if (env.GITHUB_ACTIONS !== 'true') return 'not a GitHub Actions run';
  if (env.GITHUB_EVENT_NAME !== 'push') return `a ${env.GITHUB_EVENT_NAME || 'unknown'} event runs in full (only a push to main can skip)`;
  if (env.GITHUB_REF !== 'refs/heads/main') return `a push to ${env.GITHUB_REF || 'an unknown ref'} runs in full (only main can skip)`;
  if (!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA || '')) return 'no commit sha in the environment';
  return null;
}

/** { proven, why } for this environment; `read` is GitHub's answer for this commit (readProved), injectable. Never throws. */
export function decide(env, read = readProved, { asked = whyNotAsked } = {}) {
  const no = asked(env);
  if (no) return { proven: false, why: `${no}: every job runs` };
  let hit;
  try { hit = read(env); } catch (e) { return { proven: false, why: `GitHub could not be read (${String(e.message || e).slice(0, 160)}): every job runs` }; }
  if (!hit) return { proven: false, why: `no green release run of ${env.GITHUB_SHA.slice(0, 9)} on record: every job runs` };
  return { proven: true, why: `run ${hit.id} on ${hit.branch} proved ${env.GITHUB_SHA.slice(0, 9)} green: every job is skipped` };
}

// ── --selftest ─────────────────────────────────────────────────────────────
const SHA = 'a'.repeat(40);
const REPO = 'owner/game';
const run = (o = {}) => ({ id: 7, head_sha: SHA, path: '.github/workflows/smoke.yml', head_branch: 'release/v0.2.137', event: 'push',
  status: 'completed', conclusion: 'success', repository: { full_name: REPO }, head_repository: { full_name: REPO }, ...o });
const MAIN = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: SHA, GITHUB_RUN_ID: '99', GITHUB_REPOSITORY: REPO };
/* Each planted run must NOT prove the commit; [label, run]. */
const FOOLS = [
  ['another commit', run({ head_sha: 'b'.repeat(40) })],
  ['another workflow file', run({ path: '.github/workflows/pages.yml' })],
  ['the next branch', run({ head_branch: 'next' })],
  ['a lane branch named like a release', run({ head_branch: 'lane/release/x' })],
  ['a dispatch', run({ event: 'workflow_dispatch' })],
  ['a pull request from a branch named release/x', run({ event: 'pull_request' })],
  ['a red run', run({ conclusion: 'failure' })],
  ['a cancelled run', run({ conclusion: 'cancelled' })],
  ['a run still going', run({ status: 'in_progress', conclusion: null })],
  ['a fork\'s run', run({ head_repository: { full_name: 'someone/game' } })],
  ['this run itself', run({ id: 99 })],
];
/* Each environment must not skip even with a green release run on record; [label, env]. */
const EVENTS = [
  ['the nightly schedule', { ...MAIN, GITHUB_EVENT_NAME: 'schedule' }],
  ['a dispatch on main', { ...MAIN, GITHUB_EVENT_NAME: 'workflow_dispatch' }],
  ['a pull request', { ...MAIN, GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/1/merge' }],
  ['a push to a release branch', { ...MAIN, GITHUB_REF: 'refs/heads/release/v0.2.137' }],
  ['a push to next', { ...MAIN, GITHUB_REF: 'refs/heads/next' }],
  ['a local run', { ...MAIN, GITHUB_ACTIONS: '' }],
  ['no sha', { ...MAIN, GITHUB_SHA: '' }],
];

function checks(impl) {
  const ctx = { sha: SHA, own: '99', repo: REPO };
  const out = [[!!impl.provedBy([run()], ctx), 'a green release push of this commit proves it']];
  for (const [label, r] of FOOLS) out.push([!impl.provedBy([r], ctx), `${label} proves nothing`]);
  out.push([!!impl.provedBy([run({ conclusion: 'failure', id: 5 }), run({ id: 6 })], ctx), 'a green run beside a red one of the same commit proves it']);
  const green = () => ({ id: 7, branch: 'release/v0.2.137' });
  out.push([impl.decide(MAIN, green).proven === true, 'a push to main with a green release run skips']);
  for (const [label, env] of EVENTS) out.push([impl.decide(env, green).proven === false, `${label} runs in full`]);
  out.push([impl.decide(MAIN, () => null).proven === false, 'no green release run: main runs in full']);
  out.push([impl.decide(MAIN, () => { throw new Error('HTTP 502'); }).proven === false, 'a failed read runs in full']);
  out.push([/HTTP 502/.test(impl.decide(MAIN, () => { throw new Error('HTTP 502'); }).why), 'a failed read says why']);
  return out;
}

function selftest() {
  const fails = [];
  const real = { provedBy, decide };
  for (const [ok, label] of checks(real)) { console.log(`  ${ok ? 'ok      ' : 'FAILED  '} ${label}`); if (!ok) fails.push(label); }
  const planted = [
    ...PROOF_RULES.map(([name]) => [`the rule "${name}" dropped`, { provedBy: (r, c) => provedBy(r, c, PROOF_RULES.filter(([n]) => n !== name)), decide }]),
    ['any run proves the commit', { provedBy: (r) => (r.length ? { id: 1, branch: 'x' } : null), decide }],
    ['every event may skip', { provedBy, decide: (env, read) => decide(env, read, { asked: (e) => (e.GITHUB_SHA ? null : 'no sha') }) }],
    ['a push to any branch may skip', { provedBy, decide: (env, read) => decide(env, read, { asked: (e) => (e.GITHUB_ACTIONS === 'true' && e.GITHUB_EVENT_NAME === 'push' && e.GITHUB_SHA ? null : 'x') }) }],
    ['a failed read counts as proved', { provedBy, decide: (env, read) => decide(env, (e) => { try { return read(e); } catch { return { id: 0, branch: '?' }; } }) }],
    ['a failed read is silent', { provedBy, decide: (env, read) => { const d = decide(env, read); return { ...d, why: d.why.replace(/\(.*\)/, '') }; } }],
  ];
  for (const [label, impl] of planted) {
    const missed = checks(impl).every(([ok]) => ok);
    console.log(`  ${missed ? 'MISSED  ' : 'CAUGHT  '} mutant: ${label}`);
    if (missed) fails.push(`mutant missed: ${label}`);
  }
  console.log(fails.length ? `\nrelease-proven --selftest: ${fails.length} failed` : `\nrelease-proven --selftest: ${checks(real).length} checks green, ${planted.length}/${planted.length} mutants caught`);
  return fails.length ? 1 : 0;
}

function main(argv) {
  if (argv.includes('--selftest')) return selftest();
  const env = process.env;
  const d = decide(env);
  console.log(`release-proven: ${d.why}`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `proven=${d.proven ? 'true' : 'false'}\n`);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `release-proven: ${d.why}\n`);
  return 0;
}

if (isMain(import.meta.url)) process.exit(main(process.argv.slice(2)));
