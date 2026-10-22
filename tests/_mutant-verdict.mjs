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
// ════════════════════════════════════════════════════════════════════════
import { isMain } from './_is-main.mjs';

export const HARNESS = 'HARNESS';
const firstLine = (e) => String(e && e.message !== undefined ? e.message : e).split('\n')[0];

/** The fail line for an exception a catch-all swallowed: it names where, and is never a rule. */
export const harnessFail = (where, e) => `${HARNESS} ${where} threw: ${firstLine(e)}`;

/** The rule id a fail line starts with, or null. `AW-x` / `UI-?` (the old catch-all ids) are not rules. */
export function ruleOf(line) {
  const m = /^([A-Z][A-Z0-9]*-[A-Za-z0-9-]+)(?=[\s:]|$)/.exec(String(line));
  return m && !/-x$/.test(m[1]) ? m[1] : null;
}

/** { kind: 'caught', rule } | { kind: 'harness', why } | { kind: 'escaped' } for one run's fail lines. */
export function verdict(fails) {
  const lines = Array.isArray(fails) ? fails : [];
  const named = lines.find((f) => !String(f).startsWith(HARNESS) && ruleOf(f));
  if (named) return { kind: 'caught', rule: ruleOf(named) };
  if (lines.length) return { kind: 'harness', why: String(lines.find((f) => String(f).startsWith(HARNESS)) || 'a fail line with no rule id: ' + lines[0]).slice(0, 300) };
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

/** A clean control: green, or the printed reason it is RED (1) / HARNESS (2). */
export async function cleanControl(run) {
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

async function selftest(v = { judge, verdict, cleanControl }) {
  const cases = [
    ['a mutant whose page throws before its rule runs', await v.judge(miniChecks({ throwBefore: true })), 'harness'],
    ['an exception thrown out of the run', await v.judge(miniChecks({ throwOut: true })), 'harness'],
    ['a fail line with no rule id', await v.judge(miniChecks({ unnamed: true })), 'harness'],
    ['a named rule that went red', await v.judge(miniChecks({ ruleFails: true })), 'caught'],
    ['a named rule red beside a later throw', v.verdict(['AW-9 the Use button sent nothing', harnessFail('a page step', new Error('x'))]), 'caught'],
    ['the old catch-all id AW-x', v.verdict(['AW-x a step failed: element is not enabled']), 'harness'],
    ['nothing red', await v.judge(miniChecks()), 'escaped'],
  ];
  const fails = [];
  for (const [label, got, want] of cases) if (got.kind !== want) fails.push(`${label}: ${got.kind}, want ${want}`);
  const cc = await v.cleanControl(miniChecks({ throwBefore: true }));
  if (cc.code !== 2) fails.push(`a clean control that throws: code ${cc.code}, want 2 (HARNESS)`);
  const cg = await v.cleanControl(miniChecks());
  if (cg.code !== 0) fails.push(`a clean control with nothing red: code ${cg.code}, want 0`);
  return fails;
}

/* The plain run: every runner that imports this file judges through it — none of the
   old shapes survives in it (a fail-count catch line, an `X-x a step failed` catch-all,
   a rule helper that files a throw under its rule id). */
const OLD_SHAPES = [
  [/if \(fails\.length\) console\.log\('  ✓ ' \+ name \+ ' — caught/, 'counts any fail line as a catch'],
  [/'[A-Z]+-[x?] [^']*(step failed|step threw)/, 'files a throw under a catch-all rule id'],
  [/fails\.push\(id \+ ': threw '/, 'files a throw under the rule that threw'],
];
export function plainProblems(files) {
  const out = [];
  for (const [rel, src] of files) {
    if (!/from '\.\/_mutant-verdict\.mjs'/.test(src)) continue;
    for (const [re, what] of OLD_SHAPES) if (re.test(src)) out.push(`${rel} ${what}`);
  }
  return out;
}

if (isMain(import.meta.url) && !process.argv.includes('--selftest')) {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(dir).filter((n) => n.endsWith('.mjs') && n !== '_mutant-verdict.mjs').map((n) => ['tests/' + n, readFileSync(join(dir, n), 'utf8')]);
  const users = files.filter(([, s]) => /from '\.\/_mutant-verdict\.mjs'/.test(s)).length;
  const bad = plainProblems(files);
  for (const b of bad) console.log('  ✗ ' + b);
  /* the check bites: a runner put back on the old fail-count line is red */
  const planted = plainProblems([['tests/x.mjs', "import { judge } from './_mutant-verdict.mjs';\n    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0] + ')');"]]);
  if (!planted.length) console.log('  ✗ the planted old catch line was not seen');
  console.log(bad.length || !planted.length ? `_mutant-verdict: ${bad.length} runner(s) on an old shape` : `_mutant-verdict: ${users} mutant runner(s) count a catch only by a named rule`);
  process.exit(bad.length || !planted.length ? 1 : 0);
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
  console.log(old.length ? `  caught  planted: the old "any fail line is a catch" rule — ${old[0]}` : '  MISSED  planted: the old "any fail line is a catch" rule passed');
  const bad = real.length + (old.length ? 0 : 1);
  console.log(bad ? `_mutant-verdict --selftest: ${bad} FAILED` : '_mutant-verdict --selftest: a throw before the rule, a thrown run, an unnamed fail and AW-x are HARNESS; a named rule is a catch; the old any-fail rule is caught');
  process.exit(bad ? 1 : 0);
}
