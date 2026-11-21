// ════════════════════════════════════════════════════════════════════════
// tests/_pure-guard.mjs — THE RUNNER A PAGE GUARD'S NODE HALF SHARES (architecture audit item 8, "rules proven in Node").
//
// Not a guard: the command line and the mutation loop of tests/hunt-screen-pure.mjs, tests/client-boot-pure.mjs and
// tests/tally-window-pure.mjs. Each holds the rules of a page guard (tests/<x>.mjs) that need no browser, run as
// `pure(base)` over modules imported from `base` (the repository, or a temp copy of src with a mutant planted), and the
// mutants that page guard planted in modules with no DOM. A rule's fail line carries its page rule's id, so the verdict
// (tests/_mutant-verdict.mjs) names the same rule the page did.
//
//   runPureGuard({ guard, green, pure, mutants, mutate })   plain: the rules from the repository (exit 0 / 1)
//                                                  `mutate` (the guard's own --mutate branch) [--only <words>]: two clean controls (the repository; a temp
//                                                  copy of src with nothing planted, so a copy that cannot load never reads
//                                                  as a catch), then each mutant planted into its own temp copy and judged
//   planted(over, run)                             a temp copy of src (the vendored SDK left out) with `over` (file -> text)
//                                                  written in, `run(base)` from it, the copy removed
//
// A gated push proves only the mutants its diff touches (tools/lib/mutant-scope.mjs scopedMutants); the nightly all.
// mutant-anchors: none — a helper, not a guard
// ════════════════════════════════════════════════════════════════════════
import { mkdtempSync, cpSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge, report, exitOf, cleanControl } from './_mutant-verdict.mjs';
import { scopedMutants } from '../tools/lib/mutant-scope.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** `run(base)` from a temp copy of src with `over` written in; the copy is removed whatever happens. */
export async function planted(over, run) {
  const tmp = mkdtempSync(join(tmpdir(), 'hr-pure-'));
  try {
    cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true, filter: (p) => !/[\\/]vendor([\\/]|$)/.test(p.slice(ROOT.length)) });
    for (const [f, text] of Object.entries(over)) writeFileSync(join(tmp, f), text);
    return await run(tmp);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/**
 * The guard's command line. Exit code (plain: 0 green, 1 red; --mutate: tests/_mutant-verdict.mjs exitOf).
 * The guard branches on its own --mutate and hands the answer over as `mutate` (tests/guard-hygiene.mjs reads the branch in the guard).
 * @param {{ guard: string, green: string, pure: (base: string) => Promise<string[]>, mutants: any[], mutate: boolean, argv?: string[] }} g
 */
export async function runPureGuard({ guard, green, pure, mutants, mutate, argv = process.argv }) {
  const name = guard.replace(/^tests\//, '').replace(/\.mjs$/, '');
  if (!mutate) {
    const fails = await pure(ROOT);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? name + ': ' + fails.length + ' rule(s) RED' : name + ': ' + green);
    return fails.length ? 1 : 0;
  }
  const at = argv.indexOf('--only');
  const words = at > 0 ? argv[at + 1] : null;
  const picked = mutants.filter(([n]) => !words || n.includes(words));
  if (!picked.length) { console.log('  ✗ --only ' + words + ' selects no mutant'); return 2; }
  const mine = scopedMutants(guard, picked);
  if (!mine.length) return 0;
  for (const [label, run] of [['', () => pure(ROOT)], [' (a temp copy of src, nothing planted)', () => planted({}, pure)]]) {
    const clean = await cleanControl(run);
    console.log(clean.line + label);
    if (clean.code) return clean.code;
  }
  const counts = { caught: 0, harness: 0, escaped: 0 };
  for (const [n, file, from, to] of mine) {
    let text = readFileSync(join(ROOT, file), 'utf8');
    const pairs = Array.isArray(from) ? from : [[from, to]];
    const missing = pairs.find(([x]) => !text.includes(x));
    if (missing) { console.log('  ✗ ' + n + ' — HARNESS: anchor not found in ' + file); counts.harness++; continue; }
    for (const [x, y] of pairs) text = text.replace(x, y);
    console.log(report(n, await judge(() => planted({ [file]: text }, pure)), counts));
  }
  console.log(exitOf(counts) ? name + ' --mutate: ' + counts.escaped + ' escaped, ' + counts.harness + ' HARNESS (not catches)'
    : name + ' --mutate: ' + mine.length + '/' + mine.length + ' mutants caught, each by a named rule' + (mine.length === mutants.length ? '' : ' (of ' + mutants.length + ')'));
  return exitOf(counts);
}
