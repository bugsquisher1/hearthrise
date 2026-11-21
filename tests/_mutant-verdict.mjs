#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/_mutant-verdict.mjs — A MUTANT IS CAUGHT BY A NAMED RULE, NEVER BY A CRASH.
//
//   node tests/_mutant-verdict.mjs --selftest
//
// mutant-anchors: none — the selftest judges in-memory runs, it patches no file
//
// THE INCIDENT (2026-10-22, tests/alpha-windows.mjs). A click inside AW-8 threw
// ("element is not enabled"); checks()'s catch-all turned it into a fail line,
// "AW-x a step failed", and the --mutate loop counted ANY fail line as a catch.
// Every mutant after AW-8 was "caught" by the throw while its own rule never ran.
// A catch by crash is not a proof.
//
// THE RULE, shared by the page-guard mutant runners (alpha-windows, hunt-screen,
// party-ui, character-window, preset-names, window-camera, session-core):
//   CAUGHT   a fail line that starts with a NAMED rule id (AW-8, HS-22, UI-3, PI-TOWN):
//            that rule ran and went red.
//   HARNESS  an exception — swallowed by a catch-all (harnessFail) or thrown out of the
//            run (judge) — or a fail line with no rule id. Never a catch: the runner
//            exits 2, and a clean control that throws is HARNESS too.
//   ESCAPED  no fail line at all: the mutant was NOT caught (exit 1).
//
// THE SAME RULE FOR NODE CASE RUNNERS (2026-11-20, lane/c-hollow-proofs: hunt-tiers' 25 mutants and 110 more in hunt-core were "caught"
// by `threw Cannot find module` or a load-time refusal): caseVerdict / caughtBy judge a case's answer, and a throw, a HARNESS line or a
// `fixture:` line is never a catch. The plain run scans every runner in tests/ and tools/ for a score that takes any answer as a catch.
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';

export const HARNESS = 'HARNESS';
const firstLine = (e) => String(e && e.message !== undefined ? e.message : e).split('\n')[0];

/* WHICH STEP THREW (2026-11-09, runs 42678595702 and 42735492394: "a page step threw: page.click: Timeout 6000ms
   exceeded." for one alpha-windows mutant, on the runner only, and nothing said which of its hundreds of clicks).
   The guard's own lines in the stack, innermost first, at most two: the throwing line, then its caller (a helper
   such as openWin, then the step that called it). A guard is a tests/*.mjs whose name has no leading `_`
   (the `_` files are the shared harness); Playwright's errors carry the caller's frames. */
const GUARD_FRAME = /[\\/]tests[\\/]([A-Za-z0-9][\w.-]*\.mjs):(\d+):\d+/;
export function guardLines(e) {
  const frames = [];
  for (const l of String((e && e.stack) || '').split('\n')) {
    const m = /^\s+at /.test(l) && GUARD_FRAME.exec(l);
    if (m && !frames.some(([f, n]) => f === m[1] && n === m[2])) frames.push([m[1], m[2]]);
    if (frames.length === 2) break;
  }
  const why = stuckOn(e);
  if (!frames.length) return why ? ' (' + why + ')' : '';
  const [[file, line], caller] = frames;
  return ' (at tests/' + file + ':' + line + (caller ? ' < ' + (caller[0] === file ? '' : caller[0] + ':') + caller[1] : '') + (why ? '; ' + why : '') + ')';
}

/* What a timed-out action last waited on, from Playwright's call log: the element over the press ("p.hh-intent-msg
   intercepts pointer events"), the state it never reached ("element is not enabled"), or a locator that never
   matched. '' for any other error. */
const STUCK = /intercepts pointer events|element is not (?:visible|enabled|stable|attached|editable)|element is outside of the viewport/;
export function stuckOn(e) {
  const msg = String(e && e.message !== undefined ? e.message : '');
  if (!/Timeout \d+ms exceeded/.test(msg)) return '';
  const log = msg.split('\n').slice(1).map((l) => l.replace(/\u001b\[[0-9;]*m/g, '').trim().replace(/^- /, ''));
  const last = log.filter((l) => STUCK.test(l)).pop();
  if (last) {
    const open = /^<([a-z][\w-]*)\b[^>]*>/.exec(last);
    const cls = open ? /\sclass="([^"]*)"/.exec(open[0]) : null;
    const who = open ? open[1] + (cls && cls[1].trim() ? '.' + cls[1].trim().split(/\s+/).join('.') : '') + ' ' : '';
    return (who + last.match(STUCK)[0]).slice(0, 90);
  }
  const wanted = log.find((l) => /^waiting for locator\(/.test(l));
  return wanted && !log.some((l) => /^locator resolved to /.test(l)) ? ('nothing matched ' + wanted.slice(12)).slice(0, 90) : '';
}

/** The fail line for an exception a catch-all swallowed: it names where, the guard line that threw (and what it waited
    on), and is never a rule. */
export const harnessFail = (where, e) => `${HARNESS} ${where} threw: ${firstLine(e)}${guardLines(e)}`;

/** The rule id a fail line starts with, or null. `AW-x` / `UI-?` (the old catch-all ids) are not rules. */
export function ruleOf(line) {
  const m = /^([A-Z][A-Z0-9]*-[A-Za-z0-9-]+)(?=[\s:]|$)/.exec(String(line));
  return m && !/-x$/.test(m[1]) ? m[1] : null;
}

/* A NAMED LINE THAT NEVER MEASURED (lane/c-hollow-proofs-browser 2026-11-20, the page twin of NOT_A_RULE): a rule id followed (after an
   optional [tag]) by `threw` (a throw filed under the rule that threw) or `fixture:` (its setup never reached the rule). */
const UNMEASURED = /^[A-Z][A-Z0-9]*-[A-Za-z0-9-]+:?\s+(?:\[[^\]]*\]\s+)?(?:threw\b|fixture:)/;

/** { kind: 'caught', rule } | { kind: 'harness', why } | { kind: 'escaped' } for one run's fail lines. */
export function verdict(fails) {
  const lines = Array.isArray(fails) ? fails : [];
  const named = lines.find((f) => !String(f).startsWith(HARNESS) && !UNMEASURED.test(String(f)) && ruleOf(f));
  if (named) return { kind: 'caught', rule: ruleOf(named) };
  if (lines.length) {
    const why = lines.find((f) => String(f).startsWith(HARNESS)) || lines.find((f) => UNMEASURED.test(String(f)));
    return { kind: 'harness', why: String(why ? (String(why).startsWith(HARNESS) ? why : 'a rule that never measured: ' + why) : 'a fail line with no rule id: ' + lines[0]).slice(0, 300) };
  }
  return { kind: 'escaped' };
}

/** Run one arm (a clean control or a mutant) and judge it; an exception out of the run is HARNESS. */
export async function judge(run) {
  try { return verdict(await run()); } catch (e) { return { kind: 'harness', why: harnessFail('the run', e) }; }
}

/** The line a runner prints for one mutant, and the counters it bumps. */
export function report(name, v, counts) {
  if (v.kind === 'caught') { counts.caught++; return '  ✓ ' + name + ' — caught (' + v.rule + ')'; }
  if (v.kind === 'harness') { counts.harness++; return '  ✗ ' + name + ' — HARNESS, not a catch: ' + v.why; }
  counts.escaped++;
  return '  ✗ ' + name + ' — NOT caught';
}

/** Exit code: 1 when a mutant escaped, else 2 when any arm was HARNESS, else 0. */
export const exitOf = (counts) => (counts.escaped ? 1 : counts.harness ? 2 : 0);

/* ── NODE CASE RUNNERS (2026-11-20, lane/c-hollow-proofs) ──────────────────────────────────────────────────────────
   The hunt-core shape and every runner like it: a named CASE answers its failure as a string, or null, and each mutant
   must make its case answer. THE INCIDENT: tests/hunt-core/hunt-tiers.mjs planted a copy of tools/balance-sim without
   tests/_is-main.mjs, so all 25 of its mutants "were caught" by `threw Cannot find module`, and about thirty runners
   scored a mutant on `!!why` after a catch that filed the throw as `why`. A case that THREW never answered, and a
   reason that says its fixture never reached the rule ("fixture: ...") is no answer either: both are HARNESS. */
export const NOT_A_RULE = /^(?:HARNESS\b|threw\b|fixture:)/;

/** A case's answer judged: a string (or a list's first line) that is not NOT_A_RULE is a catch; nothing is an escape. */
export function answerVerdict(why, rule) {
  if (why === null || why === undefined || why === false || why === '') return { kind: 'escaped' };
  const line = Array.isArray(why) ? (why.length ? String(why[0]) : '') : String(why);
  if (!line) return { kind: 'escaped' };
  if (NOT_A_RULE.test(line)) return { kind: 'harness', why: line.slice(0, 300) };
  return { kind: 'caught', rule, why: line };
}

/** Run one case on one planted copy and judge it: { kind: 'caught', rule, why } | { kind: 'harness', why } | { kind: 'escaped' }. */
export async function caseVerdict(run, rule) {
  let why;
  try { why = await run(); } catch (e) { return { kind: 'harness', why: harnessFail('the case', e) }; }
  return answerVerdict(why, rule);
}

/** A case runner's fail line for one mutant: null when its case caught it, else why not (an escape, or HARNESS: never a catch). */
export function caseMiss(name, rule, v) {
  if (v.kind === 'caught') return null;
  return 'mutant "' + name + '" was NOT caught by ' + rule + (v.kind === 'harness' ? ' (HARNESS, not a catch: ' + v.why + ')' : '');
}

/** The one-line form for a runner that already filed a throw as `'threw ' + e.message`: `R.ok(caughtBy(why), 'mutant ...' + missWhy(why))`. */
export const caughtBy = (why) => answerVerdict(why).kind === 'caught';
export const missWhy = (why) => { const v = answerVerdict(why); return v.kind === 'harness' ? ' (HARNESS, not a catch: ' + v.why + ')' : ''; };

/* A GATED SHARD LEANS ON THE PLAIN RUN (2026-11-04). hunt-screen's and alpha-windows' plain runs (in-page-3, in-page-10) always run, and
   a shard's clean control is the same rules at the same commit: 3 to 7 min on each of 17 jobs even with one mutant to prove
   (rehearsal 41801603806: 11 min for 3 mutants), about 75 runner-minutes on a push and the reason one red read as six jobs.
   The nightly hands over no scope, so it still runs one per shard. Only a gated (HR_MUTANT_SCOPE) --shard run skips. */
export const skipsShardControl = (env = process.env, argv = process.argv) => !!env.HR_MUTANT_SCOPE && argv.some((a) => a.startsWith('--shard='));

/** A clean control: green, or the printed reason it is RED (1) / HARNESS (2). */
export async function cleanControl(run, { env = process.env, argv = process.argv } = {}) {
  if (skipsShardControl(env, argv)) return { code: 0, line: '  clean control: the plain run in this workflow run is this shard\'s control (the nightly runs one per shard)' };
  let fails;
  try { fails = await run(); } catch (e) { return { code: 2, line: '  ✗ clean control HARNESS: ' + harnessFail('the run', e) }; }
  if (!fails.length) return { code: 0, line: '  ✓ clean control green' };
  const harness = fails.some((f) => String(f).startsWith(HARNESS));
  return { code: harness ? 2 : 1, line: '  ✗ clean control ' + (harness ? 'HARNESS' : 'RED') + ': ' + fails.join('; ') };
}

// ── --selftest ──────────────────────────────────────────────────────────────
/* A miniature page guard with the alpha-windows shape: rules run in order inside one
   try, and its catch-all swallows a throw. Each arm is judged by the real judge(). */
function miniChecks({ throwBefore = false, ruleFails = false, throwOut = false, unnamed = false } = {}) {
  return async () => {
    const fails = [];
    if (throwOut) throw new Error('page.goto: net::ERR_CONNECTION_REFUSED');
    try {
      if (throwBefore) throw new Error('page.click: element is not enabled');   // AW-8's click, before its rule
      if (ruleFails) fails.push('AW-9 the Use button sent nothing');
      if (unnamed) fails.push('something looked wrong');
    } catch (e) { fails.push(harnessFail('a page step', e)); }
    return fails;
  };
}

async function selftest(v = { judge, verdict, cleanControl, harnessFail }) {
  const hf = v.harnessFail || harnessFail;
  const cases = [
    ['a mutant whose page throws before its rule runs', await v.judge(miniChecks({ throwBefore: true })), 'harness'],
    ['an exception thrown out of the run', await v.judge(miniChecks({ throwOut: true })), 'harness'],
    ['a fail line with no rule id', await v.judge(miniChecks({ unnamed: true })), 'harness'],
    ['a named rule that went red', await v.judge(miniChecks({ ruleFails: true })), 'caught'],
    ['a named rule red beside a later throw', v.verdict(['AW-9 the Use button sent nothing', harnessFail('a page step', new Error('x'))]), 'caught'],
    ['the old catch-all id AW-x', v.verdict(['AW-x a step failed: element is not enabled']), 'harness'],
    ['a throw filed under the rule that threw', v.verdict(['NV-1: threw w.check is not a function']), 'harness'],
    ['a tagged throw filed under its rule', v.verdict(['CW-3 [phone] threw: page.click: Timeout 1500ms exceeded.']), 'harness'],
    ['a rule whose fixture never reached it', v.verdict(['CS-M1 fixture: the mixed set {} does not use every line']), 'harness'],
    ['a rule that measured, beside one that never did', v.verdict(['CS-M1 fixture: x', 'CS-M1 the sheet shows dodge 0%']), 'caught'],
    ['a rule whose message says threw later on', v.verdict(['WN-1 a town notice reads Mira threw Cinnabar']), 'caught'],
    ['nothing red', await v.judge(miniChecks()), 'escaped'],
  ];
  const fails = [];
  for (const [label, got, want] of cases) if (got.kind !== want) fails.push(`${label}: ${got.kind}, want ${want}`);
  /* A HARNESS names the guard line that threw, then its caller; a harness (`_`) file and Playwright's own frames are passed by. */
  const at = (stack) => Object.assign(new Error('page.click: Timeout 6000ms exceeded.'), { stack: 'page.click: Timeout 6000ms exceeded.\nCall log:\n  - waiting\n' + stack });
  for (const [label, stack, want] of [
    ['a click in a helper', '    at openWin (file:///R:/a%20b/tests/alpha-windows.mjs:812:16)\n    at checks (file:///R:/a%20b/tests/alpha-windows.mjs:1571:9)\n    at async main (file:///R:/a%20b/tests/alpha-windows.mjs:3934:3)', '(at tests/alpha-windows.mjs:812 < 1571)'],
    ['a click through the shared harness', '    at signInAndPlay (/home/r/w/tests/_client-harness.mjs:90:5)\n    at open (/home/r/w/tests/hunt-screen.mjs:40:22)\n    at checks (/home/r/w/tests/hunt-screen.mjs:40:22)', '(at tests/hunt-screen.mjs:40)'],
    ['a Windows path', '    at checks (R:\\the game\\tests\\party-ui.mjs:77:3)', '(at tests/party-ui.mjs:77)'],
  ]) {
    const line = hf('a page step', at(stack));
    if (!line.endsWith(want)) fails.push(`${label}: "${line}", want it to end ${want}`);
  }
  if (hf('a page step', 'a string').includes('(at ')) fails.push('a thrown string named a guard line it does not have');
  /* ...and, for a timed-out action, what it waited on (Playwright's call log, colours and all). */
  const log = (lines) => Object.assign(new Error('x'), { message: 'page.click: Timeout 6000ms exceeded.\nCall log:\n' + lines.map((l) => '\u001b[2m  - ' + l + '\u001b[22m').join('\n'),
    stack: 'page.click: Timeout 6000ms exceeded.\n    at checks (/w/tests/alpha-windows.mjs:1886:20)' });
  for (const [label, lines, want] of [
    ['a press under the answer line', ['waiting for locator(\'.x\')', 'locator resolved to <button class="hh-tool">Carry 15</button>', '<p role="status" class="hh-intent-msg">Carried 25.</p> intercepts pointer events', 'retrying click action'],
      '(at tests/alpha-windows.mjs:1886; p.hh-intent-msg intercepts pointer events)'],
    ['a press that stays off', ['waiting for locator(\'.y\')', 'locator resolved to <button disabled>Go</button>', 'element is not enabled', 'retrying click action'], '(at tests/alpha-windows.mjs:1886; element is not enabled)'],
    ['a control that never came', ['waiting for locator(\'.hw-gone\')'], '(at tests/alpha-windows.mjs:1886; nothing matched locator(\'.hw-gone\'))'],
  ]) {
    const line = hf('a page step', log(lines));
    if (!line.endsWith(want)) fails.push(`${label}: "${line}", want it to end ${want}`);
  }
  const cc = await v.cleanControl(miniChecks({ throwBefore: true }));
  if (cc.code !== 2) fails.push(`a clean control that throws: code ${cc.code}, want 2 (HARNESS)`);
  const cg = await v.cleanControl(miniChecks());
  if (cg.code !== 0) fails.push(`a clean control with nothing red: code ${cg.code}, want 0`);
  /* A red rule: only a gated --shard run leans on the plain run. A shard with no scope (the nightly), or a scope with no shard, judges for itself. */
  const red = miniChecks({ ruleFails: true });
  for (const [label, o, want] of [
    ['a gated shard', { env: { HR_MUTANT_SCOPE: 'plan.json' }, argv: ['--shard=2/6'] }, 0],
    ['the nightly\'s shard', { env: {}, argv: ['--shard=2/6'] }, 1],
    ['a gated run with no shard', { env: { HR_MUTANT_SCOPE: 'plan.json' }, argv: [] }, 1],
  ]) {
    const got = (await v.cleanControl(red, o)).code;
    if (got !== want) fails.push(`${label}: clean control code ${got}, want ${want}`);
  }
  return fails;
}

/* THE NODE CASE RUNNER, IN MINIATURE (hunt-core's shape): a case answers its failure or null, a planted copy is loaded and the
   case run on it. A mutant whose copy cannot load (hunt-tiers: `Cannot find module ... _is-main.mjs`), whose case throws, or whose
   case says only that its fixture never reached the rule must read NOT caught; a rule's own line is the only catch. Each arm goes
   through both forms the runners use: caseVerdict (the run inside), and the one-line caughtBy over a `'threw ' + e.message` answer. */
async function caseSelftest(c = { caseVerdict, answerVerdict, caughtBy, missWhy }) {
  const rows = (T) => (T.offers('mill_cellar').includes('deadly') ? 'rows: the Cellar offers Deadly' : null);
  const load = (kind) => {
    if (kind === 'missing') throw new Error("Cannot find module 'tests/_is-main.mjs' imported from tools/balance-sim/weapon-power.mjs");
    return { offers: (g) => (kind === 'planted' ? ['normal', 'deadly'] : kind === 'throws' ? g.no.such : ['normal']) };
  };
  const fixture = () => 'fixture: killed 0 and 0 an hour';
  const fails = [];
  for (const [label, run, want] of [
    ['a planted copy that cannot load', () => rows(load('missing')), 'harness'],
    ['a case that throws on the planted copy', () => rows(load('throws')), 'harness'],
    ['a fixture line (the rule never measured)', fixture, 'harness'],
    ['the rule\'s own line', () => rows(load('planted')), 'caught'],
    ['the clean copy (nothing planted)', () => rows(load('clean')), 'escaped'],
  ]) {
    const got = (await c.caseVerdict(run, 'rows')).kind;
    if (got !== want) fails.push(`caseVerdict, ${label}: ${got}, want ${want}`);
    /* the one-line form, as h1.js suite() and every hunt-core loop score it */
    let why = null;
    try { why = run(); } catch (e) { why = 'threw ' + e.message; }
    if (c.caughtBy(why) !== (want === 'caught')) fails.push(`caughtBy, ${label}: ${c.caughtBy(why) ? 'caught' : 'not caught'}, want ${want}`);
    if (want === 'harness' && !/HARNESS, not a catch/.test(c.missWhy(why))) fails.push(`missWhy, ${label}: says ${JSON.stringify(c.missWhy(why))}, not HARNESS`);
  }
  return fails;
}

/* The plain run. Every runner that imports this file judges through it: none of the old shapes survives in it (a fail-count catch
   line, an `X-x a step failed` catch-all, a rule helper that files a throw under its rule id). And EVERY mutant runner in tests/ and
   tools/ (lane/c-hollow-proofs 2026-11-20): none scores a mutant on a bare truthy answer, the shape that read hunt-tiers' 25
   `threw Cannot find module` as 25 catches. */
const OLD_SHAPES = [
  [/if \(fails\.length\) console\.log\('  ✓ ' \+ name \+ ' — caught/, 'counts any fail line as a catch'],
  [/'[A-Z]+-[x?] [^']*(step failed|step threw)/, 'files a throw under a catch-all rule id'],
  [/fails\.push\(id \+ ': threw '/, 'files a throw under the rule that threw'],
];
const EVERY_RUNNER = [
  [/\.ok\(\s*!!\s*\w+\s*,\s*'mutant /, 'scores a mutant on a truthy answer (a throw filed as the answer reads as a catch): judge it with caughtBy / caseVerdict'],
  [/if \(fails\.length\) console\.log\('  ✓ ' \+ \w+ \+ ' — caught/, 'counts any fail line as a catch (a HARNESS line reads as one): judge it with verdict / judge'],
  [/if \(why\) console\.log\('  CAUGHT/, 'counts any answer as a catch (a throw filed as the answer reads as one): judge it with caughtBy'],
];
/* OWED (frozen 2026-11-20; it only shrinks): page runners still on the fail-count line, each a browser --mutate the hollow-proofs lane
   could not re-prove in its hour. A file leaves by moving onto judge/report/exitOf (tests/tally-window.mjs's 2026-11-20 diff) and a run
   of its --mutate; a file on this list no longer on the shape is red until it is struck from it. */
export const OWED = Object.freeze([
  'tests/chat-social.mjs', 'tests/death-popup.mjs', 'tests/device-px.mjs', 'tests/faction-window.mjs',
  'tests/farm-window.mjs', 'tests/honor-window.mjs', 'tests/house-window.mjs',
  'tests/instant-press.mjs', 'tests/monster-facts.mjs', 'tests/observability.mjs',
  'tests/phone-touch.mjs', 'tests/report-problem.mjs', 'tests/say-why.mjs', 'tests/services-window.mjs', 'tests/town-walk.mjs', 'tests/wiki-window.mjs',
]);
export function plainProblems(files, owed = OWED) {
  const out = [];
  for (const [rel, src] of files) {
    if (/from '\.\/_mutant-verdict\.mjs'/.test(src)) for (const [re, what] of OLD_SHAPES) if (re.test(src)) out.push(`${rel} ${what}`);
    const hits = EVERY_RUNNER.filter(([re]) => re.test(src));
    if (owed.includes(rel)) { if (!hits.length) out.push(`${rel} is off the old shape: strike it from OWED`); continue; }
    for (const [, what] of hits) if (!out.includes(`${rel} ${what}`)) out.push(`${rel} ${what}`);
  }
  return out;
}

if (isMain(import.meta.url) && !process.argv.includes('--selftest')) {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join, dirname, relative } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const walk = (d) => readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' || n.startsWith('.') ? [] : walk(p);
    return /\.(mjs|js)$/.test(n) ? [p] : [];
  });
  const files = [...walk(join(root, 'tests')), ...walk(join(root, 'tools'))].map((p) => relative(root, p).replace(/\\/g, '/'))
    .filter((rel) => rel !== 'tests/_mutant-verdict.mjs').map((rel) => [rel, readFileSync(join(root, rel), 'utf8')]);
  const users = files.filter(([, s]) => /from '\.\/_mutant-verdict\.mjs'|_mutant-verdict\.mjs';/.test(s)).length;
  const bad = plainProblems(files);
  for (const b of bad) console.log('  ✗ ' + b);
  /* the check bites: a runner put back on each old line is red, an importer or not, and a struck OWED file is seen */
  const planted = [
    plainProblems([['tests/x.mjs', "import { judge } from './_mutant-verdict.mjs';\n    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0] + ')');"]]),
    plainProblems([['tests/y.mjs', "    if (fails.length) console.log('  ✓ ' + label + ' — caught (' + fails[0].split(' ')[0] + ')');"]]),
    plainProblems([['tests/hunt-core/z.mjs', "    try { why = cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }\n    R.ok(!!why, 'mutant \"' + mu.name + '\" was NOT caught by ' + mu.case);"]]),
    plainProblems([['tests/w.mjs', "        if (why) console.log('  CAUGHT  ' + mu.name);"]]),
    plainProblems([['tests/v.mjs', "    console.log(report(name, await judge(run), counts));"]], ['tests/v.mjs']),
  ];
  const blind = planted.findIndex((p) => !p.length);
  if (blind >= 0) console.log('  ✗ planted old shape #' + (blind + 1) + ' was not seen');
  const red = bad.length || blind >= 0;
  console.log(red ? `_mutant-verdict: ${bad.length} runner(s) on an old shape` : `_mutant-verdict: ${users} runner(s) judge here; no mutant runner in tests/ or tools/ scores a throw as a catch (${OWED.length} page runners OWED, frozen)`);
  process.exit(red ? 1 : 0);
}

if (isMain(import.meta.url) && process.argv.includes('--selftest')) {
  const real = await selftest();
  for (const f of real) console.log('  FAILED ' + f);
  /* the old runners' rule — any fail line is a catch — must fail this selftest */
  const anyFail = (fails) => (fails && fails.length ? { kind: 'caught', rule: String(fails[0]).split(' ')[0] } : { kind: 'escaped' });
  const old = await selftest({
    verdict: anyFail,
    judge: async (run) => { try { return anyFail(await run()); } catch (e) { return { kind: 'caught', rule: 'crash' }; } },
    cleanControl: async (run) => { try { return { code: (await run()).length ? 1 : 0 }; } catch { return { code: 1 }; } },
  });
  /* the shard's skip must fail it both ways: every shard skips, or none does */
  const always = await selftest({ judge, verdict, cleanControl: (run, o) => (o ? cleanControl(run, { env: { HR_MUTANT_SCOPE: 'x' }, argv: ['--shard=1/2'] }) : cleanControl(run)) });
  const never = await selftest({ judge, verdict, cleanControl: (run) => cleanControl(run, { env: {}, argv: [] }) });
  /* a HARNESS that names no step (runs 42678595702, 42735492394) must fail it */
  const nameless = await selftest({ judge, verdict, cleanControl, harnessFail: (where, e) => `${HARNESS} ${where} threw: ${firstLine(e)}` });
  console.log(nameless.length ? '  caught  planted: a HARNESS that names no step' : '  MISSED  planted: a HARNESS that names no step');
  /* a rule id over a throw or a fixture line (`NV-1: threw`, `CS-M1 fixture:`) read as a catch must fail it */
  const anyNamed = (fails) => { const lines = Array.isArray(fails) ? fails : []; const n = lines.find((f) => !String(f).startsWith(HARNESS) && ruleOf(f));
    return n ? { kind: 'caught', rule: ruleOf(n) } : lines.length ? { kind: 'harness', why: 'x' } : { kind: 'escaped' }; };
  const unmeasured = await selftest({ judge: async (run) => { try { return anyNamed(await run()); } catch (e) { return { kind: 'harness' }; } }, verdict: anyNamed, cleanControl, harnessFail });
  console.log(unmeasured.length ? '  caught  planted: a named throw or fixture line is a catch — ' + unmeasured[0] : '  MISSED  planted: a named throw or fixture line is a catch');
  console.log(always.length ? '  caught  planted: every run skips its clean control' : '  MISSED  planted: every run skips its clean control');
  console.log(never.length ? '  caught  planted: no gated shard leans on the plain run' : '  MISSED  planted: no gated shard leans on the plain run');
  console.log(old.length ? `  caught  planted: the old "any fail line is a catch" rule — ${old[0]}` : '  MISSED  planted: the old "any fail line is a catch" rule passed');
  /* THE CASE RUNNERS (lane/c-hollow-proofs): the real judge, then the rules that made hunt-tiers' 25 mutants hollow, each must fail it */
  const cases = await caseSelftest();
  for (const f of cases) console.log('  FAILED ' + f);
  const truthy = (why) => (why ? { kind: 'caught', rule: 'case', why: String(why) } : { kind: 'escaped' });
  const caseMutants = [
    ['the old `!!why` score (a throw filed as the answer is a catch)', { caseVerdict: async (run) => { try { return truthy(await run()); } catch (e) { return truthy('threw ' + e.message); } },
      answerVerdict: truthy, caughtBy: (why) => !!why, missWhy: () => '' }],
    ['a throw out of the case is a catch', { caseVerdict: async (run) => { try { return answerVerdict(await run()); } catch (e) { return { kind: 'caught', rule: 'crash' }; } }, answerVerdict, caughtBy, missWhy }],
    ['a fixture line is a catch', { caseVerdict: async (run) => { const v = await caseVerdict(run); return v.kind === 'harness' && /^fixture:/.test(v.why) ? { kind: 'caught' } : v; },
      answerVerdict, caughtBy: (why) => caughtBy(why) || /^fixture:/.test(String(why)), missWhy }],
  ];
  let caseMissed = 0;
  for (const [label, impl] of caseMutants) {
    const f = await caseSelftest(impl);
    console.log(f.length ? `  caught  planted: ${label} — ${f[0]}` : `  MISSED  planted: ${label}`);
    if (!f.length) caseMissed++;
  }
  const bad = real.length + cases.length + caseMissed + (old.length ? 0 : 1) + (always.length ? 0 : 1) + (never.length ? 0 : 1) + (nameless.length ? 0 : 1) + (unmeasured.length ? 0 : 1);
  console.log(bad ? `_mutant-verdict --selftest: ${bad} FAILED` : '_mutant-verdict --selftest: a throw before the rule, a thrown run, an unnamed fail and AW-x are HARNESS, each naming the guard line that threw; a named rule is a catch; the old any-fail rule is caught; a case runner\'s throwing mutant (a copy that cannot load, a case that throws) and its fixture line read NOT caught, and the old `!!why` score is caught');
  process.exit(bad ? 1 : 0);
}
